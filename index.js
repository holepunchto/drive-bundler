const fs = require('fs')
const path = require('path')
const b4a = require('b4a')
const Deps = require('dependency-stream')
const mutex = require('mutexify/promise')
const sodium = require('sodium-native')
const { pathToFileURL } = require('url-file-url')

module.exports = class DriveBundle {
  constructor (drive, {
    cwd = path.resolve('.'),
    mount = '',
    cache = null,
    host = require.addon ? require.addon.host : process.platform + '-' + process.arch,
    portable = false,
    prebuilds = true,
    absolutePrebuilds = !!mount,
    packages = true,
    entrypoint = '.'
  } = {}) {
    this.drive = drive
    this.packages = packages
    this.cwd = cwd
    this.prebuilds = prebuilds
    this.cache = cache
    this.mount = typeof mount === 'string' ? mount : mount.href.replace(/[/]$/, '')
    this.absolutePrebuilds = absolutePrebuilds
    this.host = host
    this.portable = portable
    this.entrypoint = entrypoint
    this.lock = mutex()
  }

  static async bundle (drive, opts) {
    const d = new this(drive, opts)
    return await d.bundle()
  }

  static async stringify (drive, opts) {
    const d = new this(drive, opts)
    return await d.stringify()
  }

  async stringify (entrypoint = this.entrypoint) {
    const b = await this.bundle(entrypoint)
    const addons = {}
    let wrap = ''

    for (const [key, source] of Object.entries(b.sources)) {
      if (wrap) wrap += ',\n'
      wrap += JSON.stringify(key) + ': { resolutions: ' + JSON.stringify(b.resolutions[key] || {}) + ', '
      wrap += 'source (module, exports, __filename, __dirname, require) {'
      wrap += (key.endsWith('.json') ? 'module.exports = ' : '') + source
      wrap += '\n}}'
    }

    for (const [key, map] of Object.entries(b.resolutions)) {
      if (map['bare:addon']) addons[key] = map['bare:addon']
    }

    return `{
      const __bundle__ = {
        builtinRequire: typeof require === 'function' ? require : null,
        cache: Object.create(null),
        addons: ${JSON.stringify(addons)},
        bundle: {${wrap}},
        require (filename) {
          let mod = __bundle__.cache[filename]
          if (mod) return mod

          const b = __bundle__.bundle[filename]
          if (!b) throw new Error('Module not found')

          mod = __bundle__.cache[filename] = {
            filename,
            dirname: filename.slice(0, filename.lastIndexOf('/')),
            exports: {},
            require
          }

          require.resolve = function (req) {
            const res = b.resolutions[req]
            if (!res) throw new Error('Could not find module "' + req + '" from "' + mod.filename + '"')
            return res
          }

          require.addon = function (dir = '.') {
            if (!__bundle__.builtinRequire || !__bundle__.builtinRequire.addon) throw new Error('Addons not supported')

            let d = dir.startsWith('/') ? dir : mod.dirname + '/' + dir
            let p = 1
            let addon = ''

            while (p < d.length) {
              let n = d.indexOf('/', p)
              if (n === -1) n = d.length

              const part = d.slice(p, n)

              p = n + 1

              if (part === '.' || part === '') continue
              if (part === '..') {
                addon = addon.slice(0, addon.lastIndexOf('/'))
                continue
              }

              addon += '/' + part
            }

            if (!addon.endsWith('/')) addon += '/'

            const mapped = __bundle__.addons[addon]
            return mapped ? __bundle__.builtinRequire(mapped) : __bundle__.builtinRequire.addon(addon)
          }

          b.source(mod, mod.exports, mod.filename, mod.dirname, require)
          return mod

          function require (req) {
            return __bundle__.require(require.resolve(req)).exports
          }
        }
      }

      __bundle__.require(${JSON.stringify(b.entrypoint)})
    }`.replace(/\n[ ]{4}/g, '\n').trim() + '\n'
  }

  async bundle (entrypoint = this.entrypoint) {
    let main = null

    const resolutions = {}
    const sources = {}
    const stream = new Deps(this.drive, { host: this.host, packages: this.packages, source: true, portable: this.portable, entrypoint })

    const addonsPending = []

    for await (const data of stream) {
      const u = this._resolutionKey(data.key, false)
      if (!main) main = u

      if (this.cache && Object.hasOwn(this.cache, u)) continue

      const r = {}
      let save = false

      sources[u] = data.source

      for (const { input, output } of data.resolutions) {
        if (!input || !output) continue
        r[input] = this._resolutionKey(output, false)
        save = true
      }

      if (save) resolutions[u] = r

      if (this.prebuilds) {
        for (const { input, output } of data.addons) {
          if (!input || !output) continue
          addonsPending.push(this._mapPrebuild(input, output))
        }
      }
    }

    for (const addon of await Promise.all(addonsPending)) {
      if (!addon) continue
      const dir = this._resolutionKey(addon.input, true)
      const r = resolutions[dir] = resolutions[dir] || {}
      r['bare:addon'] = addon.output
    }

    return {
      entrypoint: main,
      resolutions,
      sources
    }
  }

  _resolutionKey (key, dir) {
    const trail = dir && !key.endsWith('/') ? '/' : ''
    return this.mount ? this.mount + encodeURI(key) + trail : key + trail
  }

  async extractPrebuild (key) {
    const m = key.match(/\/([^/@]+)(@[^/]+)?(\.node|\.bare)$/)
    if (!m) return null

    const buf = await this.drive.get(key)
    if (!buf) return null

    const name = hash(buf) + m[3]
    const dir = path.join(this.cwd, 'prebuilds', this.host)
    const out = path.join(dir, name)

    await writeAtomic(dir, out, buf, this.lock)

    return this.absolutePrebuilds ? pathToFileURL(out).href : '/../prebuilds/' + (this.portable ? '{host}' : this.host) + '/' + name
  }

  async _mapPrebuild (input, output) {
    const prebuild = await this.extractPrebuild(output)
    return { input, output: prebuild }
  }
}

function hash (buf) {
  const out = b4a.allocUnsafe(32)
  sodium.crypto_generichash(out, buf)
  return b4a.toString(out, 'hex')
}

async function writeAtomic (dir, out, buf, lock) {
  try {
    await fs.promises.stat(out)
    return
  } catch {}

  const release = await lock()

  try {
    await writeToTmpAndSwap(dir, out, buf)
  } finally {
    release()
  }
}

async function writeToTmpAndSwap (dir, out, buf) {
  const tmp = out + '.tmp'

  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.writeFile(tmp, buf)

  try {
    await fs.promises.rename(tmp, out)
  } catch {
    await fs.promises.stat(out)
    try {
      await fs.promises.unlink(tmp)
    } catch {}
  }
}
