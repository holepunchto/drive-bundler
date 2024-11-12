const Localdrive = require('localdrive')
const test = require('brittle')
const path = require('path')
const Bundle = require('bare-bundle')
const nodeBundle = require('node-bare-bundle')
const Bundler = require('.')

const prebuilds = path.join(__dirname, 'test/prebuilds')

test('addon, require.addon()', async function (t) {
  const drive = new Localdrive(__dirname)
  const b = new Bundler(drive, { cwd: __dirname, prebuilds, entrypoint: '/test/fixtures/addon/require-addon.js' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const result = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(result, 42)
})

test('addon, require(\'require-addon\')', async function (t) {
  const drive = new Localdrive(__dirname)
  const b = new Bundler(drive, { cwd: __dirname, prebuilds, entrypoint: '/test/fixtures/addon/require-addon-polyfill.js' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const result = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(result, 42)
})

test('addon, require(\'node-gyp-build\')', async function (t) {
  const drive = new Localdrive(__dirname)
  const b = new Bundler(drive, { cwd: __dirname, prebuilds, entrypoint: '/test/fixtures/addon/node-gyp-build.js' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const result = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(result, 42)
})

test('addon mounted, require.addon()', async function (t) {
  const drive = new Localdrive(__dirname)
  const b = new Bundler(drive, { cwd: __dirname, prebuilds, entrypoint: '/test/fixtures/addon/require-addon.js', mount: 'pear://dev' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const result = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(result, 42)
})

test('addon mounted, require(\'require-addon\')', async function (t) {
  const drive = new Localdrive(__dirname)
  const b = new Bundler(drive, { cwd: __dirname, prebuilds, entrypoint: '/test/fixtures/addon/require-addon-polyfill.js', mount: 'pear://foo' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const result = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(result, 42)
})

test('addon mounted, require(\'node-gyp-build\')', async function (t) {
  const drive = new Localdrive(__dirname)
  const b = new Bundler(drive, { cwd: __dirname, prebuilds, entrypoint: '/test/fixtures/addon/require-addon-polyfill.js', mount: 'pear://foo' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const result = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(result, 42)
})

test('asset, require.asset()', async function (t) {
  const drive = new Localdrive(__dirname)
  const b = new Bundler(drive, { cwd: __dirname, entrypoint: '/test/fixtures/asset/require-asset.js' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const asset = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(asset, path.join(__dirname, 'test/fixtures/asset/asset.txt'))
})

test('asset, require(\'require-asset\')', { skip: true }, async function (t) {
  const drive = new Localdrive(__dirname)
  const b = new Bundler(drive, { cwd: __dirname, entrypoint: '/test/fixtures/asset/require-asset-polyfill.js' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const asset = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(asset, path.join(__dirname, 'test/fixtures/asset/asset.txt'))
})

test('asset mounted, require.asset()', async function (t) {
  const drive = new Localdrive(__dirname)
  const b = new Bundler(drive, { cwd: __dirname, entrypoint: '/test/fixtures/asset/require-asset.js', mount: 'pear://dev' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const asset = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(asset, path.join(__dirname, 'test/fixtures/asset/asset.txt'))
})

test('asset mounted, require(\'require-asset\')', { skip: true }, async function (t) {
  const drive = new Localdrive(__dirname)
  const b = new Bundler(drive, { cwd: __dirname, entrypoint: '/test/fixtures/asset/require-asset-polyfill.js', mount: 'pear://dev' })

  const d = await b.bundle()

  const bundle = new Bundle()

  for (const [key, source] of Object.entries(d.sources)) {
    bundle.write(key, source)
  }

  bundle.resolutions = d.resolutions
  bundle.main = d.entrypoint

  const asset = nodeBundle(bundle.toBuffer(), { mount: path.join(__dirname, 'test.bundle') })

  t.is(asset, path.join(__dirname, 'test/fixtures/asset/asset.txt'))
})
