const fs = require('fs')
const path = require('path')
const b4a = require('b4a')
const Deps = require('dependency-stream')
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
    entrypoint = '.'
  } = {}) {
    this.drive = drive
    this.cwd = cwd
    this.prebuilds = prebuilds
    this.cache = cache
    this.mount = typeof mount === 'string' ? mount : mount.href.replace(/[/]$/, '')
    this.absolutePrebuilds = absolutePrebuilds
    this.host = host
    this.portable = portable
    this.entrypoint = entrypoint
  }

  static async bundle (drive, opts) {
    const d = new this(drive, opts)
    return await d.bundle()
  }

  async bundle (entrypoint = this.entrypoint) {
    let main = null

    const resolutions = {}
    const sources = {}
    const stream = new Deps(this.drive, { packages: true, source: true, portable: this.portable, entrypoint })

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
    if (!m) throw new Error('Key does not match /{name}.(bare|node)')

    const buf = await this.drive.get(key)
    if (!buf) throw new Error('Prebuild not found')

    const name = m[1] + '@' + hash(buf) + m[3]
    const dir = path.join(this.cwd, 'prebuilds', this.host)
    const out = path.join(dir, name)

    await writeAtomic(dir, out, buf)

    return this.absolutePrebuilds ? pathToFileURL(out).href : '/../prebuilds/' + (this.portable ? '{host}' : this.host) + '/' + name
  }

  async _mapPrebuild (input, output) {
    try {
      return { input, output: await this.extractPrebuild(output) }
    } catch {
      return null
    }
  }
}

function hash (buf) {
  const out = b4a.allocUnsafe(32)
  sodium.crypto_generichash(out, buf)
  return b4a.toString(out, 'hex')
}

async function writeAtomic (dir, out, buf) {
  try {
    await fs.promises.stat(out)
    return
  } catch {}

  const tmp = out + '.' + Date.now() + '.' + Math.random().toString(16).slice(2) + '.tmp'

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
