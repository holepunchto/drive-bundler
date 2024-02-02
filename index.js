const fs = require('fs')
const path = require('path')
const Deps = require('dependency-stream')
const sodium = require('sodium-native')

module.exports = class DriveBundle {
  constructor (drive, {
    cwd = path.resolve('.'),
    mount = '/',
    cache = null,
    host = require.addon ? require.addon.host : process.platform + '-' + process.arch,
    portable = false,
    prebuilds = true,
    absolutePrebuilds = /\.bundle(\/?)/.test(mount),
    entrypoint = '.'
  } = {}) {
    this.drive = drive
    this.cwd = cwd
    this.prebuilds = prebuilds
    this.cache = cache
    this.mount = mount.replace(/\/$/, '')
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
      if (!main) main = data.key
      if (this.cache && Object.hasOwn(this.cache, this.mount + data.key)) continue

      const r = {}
      let save = false

      sources[this.mount + data.key] = data.source

      for (const { input, output } of data.resolutions) {
        if (!input || !output) continue
        r[input] = this.mount + output
        save = true
      }

      if (save) resolutions[this.mount + data.key] = r

      if (this.prebuilds) {
        for (const { input, output } of data.addons) {
          if (!input || !output) continue
          addonsPending.push(this._mapPrebuild(input, output))
        }
      }
    }

    for (const addon of await Promise.all(addonsPending)) {
      if (!addon) continue
      const r = resolutions[this.mount + addon.input] = resolutions[this.mount + addon.input] || {}
      r['bare:addon'] = addon.output
    }

    return {
      entrypoint: main,
      resolutions,
      sources
    }
  }

  async extractPrebuild (key) {
    const m = key.match(/\/([^/@]+)(@[^/]+)?(\.node|\.bare)$/)
    if (!m) throw new Error('Key does not match /{name}.(bare|node)')

    const buf = await this.drive.get(key)
    if (!buf) throw new Error('Prebuild not found')

    const name = m[1] + '@' + hash(buf) + m[3]
    const dir = path.join(this.cwd, 'prebuilds', this.host)
    const out = path.join(dir, name)
    const res = this.absolutePrebuilds ? new URL(out, 'file:///').href : '/../prebuilds/' + (this.portable ? '{host}' : this.host) + '/' + name

    try {
      await fs.promises.stat(out)
      return res
    } catch {}

    const tmp = out + '.' + Date.now() + '.' + Math.random().toString(16).slice(2) + '.tmp'

    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(tmp, buf)

    try {
      await fs.promises.rename(tmp, out)
    } catch {
      await fs.promises.stat(out)
    }

    return res
  }

  async _mapPrebuild (input, output) {
    try {
      output = await this.extractPrebuild(output)
      return { input, output }
    } catch {
      return null
    }
  }
}

function hash (buf) {
  const out = Buffer.allocUnsafe(32)
  sodium.crypto_generichash(out, buf)
  return out.toString('hex')
}
