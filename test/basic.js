const Bundler = require('../')
const Localdrive = require('localdrive')
const test = require('brittle')
const path = require('path')
const Bundle = require('bare-bundle')
const nodeBundle = require('node-bare-bundle')

test('basic', async function (t) {
  const drive = new Localdrive(path.join(__dirname, '..'))
  const b = new Bundler(drive, { cwd: __dirname, entrypoint: '/test/fixtures/sodium.js' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const yes = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(yes, true)
})

test('basic mounted', async function (t) {
  const drive = new Localdrive(path.join(__dirname, '..'))
  const b = new Bundler(drive, { cwd: __dirname, entrypoint: '/test/fixtures/sodium.js', mount: 'pear://foo' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const yes = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(yes, true)
})
