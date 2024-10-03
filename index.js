const fs = require('fs')
const path = require('path')
const b4a = require('b4a')
const Deps = require('dependency-stream')
const mutex = require('mutexify/promise')
const sodium = require('sodium-native')
const unixResolve = require('unix-path-resolve')
const { pipelinePromise } = require('streamx')
const { pathToFileURL } = require('url-file-url')

module.exports = class DriveBundle {
  constructor (drive, {
    cwd = path.resolve('.'),
    mount = '',
    cache = null,
    host = require.addon ? require.addon.host : process.platform + '-' + process.arch,
    prebuilds = true,
    assets = true,
    absoluteFiles = !!mount,
    packages = true,
    entrypoint = '.'
  } = {}) {
    this.drive = drive
    this.packages = packages
    this.cwd = cwd
    this.prebuilds = prebuilds ? path.resolve(cwd, typeof prebuilds === 'string' ? prebuilds : 'prebuilds') : null
    this.assets = assets ? path.resolve(cwd, typeof assets === 'string' ? assets : 'assets') : null
    this.cache = cache
    this.mount = typeof mount === 'string' ? mount : mount.href.replace(/[/]$/, '')
    this.absoluteFiles = absoluteFiles
    this.host = host
    this.entrypoint = entrypoint
    this.lock = mutex()
  }

  static async bundle (drive, opts) {
    const d = new this(drive, opts)
    return await d.bundle()
  }

  async bundle (entrypoint = this.entrypoint) {
    let main = null

    const resolutions = {}
    const imports = {}
    const sources = {}
    const stream = new Deps(this.drive, { host: this.host, packages: this.packages, source: true, entrypoint })

    const addonsPending = []
    const assetsPending = []

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

      if (this.assets) {
        for (const { input, output } of data.assets) {
          assetsPending.push(this._mapAsset(data.key, input, output))
        }
      }
    }

    for (const addon of await Promise.all(addonsPending)) {
      if (!addon) continue

      const dir = this._resolutionKey(addon.input, true)
      const r = resolutions[dir] = resolutions[dir] || {}
      r['bare:addon'] = addon.output
    }

    for (const asset of await Promise.all(assetsPending)) {
      if (!asset) continue

      const r = resolutions[asset.referrer] = resolutions[asset.referrer] || {}

      const def = r[asset.input]
      r[asset.input] = { asset: asset.output }
      if (def) r[asset.input].default = def
    }

    return {
      entrypoint: main,
      resolutions,
      imports,
      sources
    }
  }

  _resolutionKey (key, dir) {
    const trail = dir && !key.endsWith('/') ? '/' : ''
    return this.mount ? this.mount + encodeURI(key) + trail : key + trail
  }

  async extractAsset (key) {
    const out = path.join(this.assets, key)

    try {
      const entry = await this.drive.entry(key)
      if (entry === null) return null

      await fs.promises.mkdir(path.dirname(out), { recursive: true })

      const driveStream = this.drive.createReadStream(entry)
      const fsStream = fs.createWriteStream(out)

      await pipelinePromise(driveStream, fsStream)

      return this.absoluteFiles ? pathToFileURL(out).href : '/../assets' + key
    } catch {
      return null
    }
  }

  async extractPrebuild (key) {
    const m = key.match(/\/([^/@]+)(@[^/]+)?(\.node|\.bare)$/)
    if (!m) return null

    const buf = await this.drive.get(key)
    if (!buf) return null

    const name = hash(buf) + m[3]
    const dir = path.join(this.prebuilds, this.host)
    const out = path.join(dir, name)

    await writeAtomic(dir, out, buf, this.lock)

    return this.absoluteFiles ? pathToFileURL(out).href : '/../prebuilds/' + this.host + '/' + name
  }

  async _mapAsset (referrer, input, output) {
    const dir = unixResolve(referrer, '..')
    const key = unixResolve(dir, input)
    const asset = await this.extractAsset(key)
    return { referrer, input, output: asset }
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
