var fakeIndexedDB = require('fake-indexeddb')
var MemoryStore = require('logux-core').MemoryStore
var ClientSync = require('logux-sync').ClientSync
var TestPair = require('logux-sync').TestPair

var Client = require('../client')

var fakeLocalStorage
beforeEach(function () {
  fakeLocalStorage = {
    storage: { },
    setItem: function (key, value) {
      this[key] = value
      this.storage[key] = value
    },
    getItem: function (key) {
      return this.storage[key]
    },
    removeItem: function (key) {
      delete this[key]
      delete this.storage[key]
    }
  }
})

var originError = console.error
var originIndexedDB = global.indexedDB
var originLocalStorage = global.localStorage
afterEach(function () {
  console.error = originError
  global.indexedDB = originIndexedDB
  global.localStorage = originLocalStorage
})

function wait (ms) {
  return new Promise(function (resolve) {
    return setTimeout(resolve, ms)
  })
}

function createDialog (opts, credentials) {
  var client = new Client(opts)

  var pair = new TestPair()
  client.sync = new ClientSync(
    client.nodeId,
    client.log,
    pair.left,
    client.sync.options
  )

  return client.sync.connection.connect().then(function () {
    return pair.wait('right')
  }).then(function () {
    pair.right.send(['connected', client.sync.localProtocol, 'server', [0, 0], {
      credentials: credentials
    }])
    return pair.wait('left')
  }).then(function () {
    return client
  })
}

function createClient () {
  var client = new Client({
    subprotocol: '1.0.0',
    userId: false,
    url: 'wss://localhost:1337'
  })
  client.sync.connection.connect = function () { }
  client.tabPing = 50
  return client
}

it('saves options', function () {
  var client = new Client({
    subprotocol: '1.0.0',
    userId: false,
    url: 'wss://localhost:1337'
  })
  expect(client.options.subprotocol).toEqual('1.0.0')
})

it('throws on missed URL', function () {
  expect(function () {
    new Client({ userId: false, subprotocol: '1.0.0' })
  }).toThrowError(/url/)
})

it('throws on missed subprotocol', function () {
  expect(function () {
    new Client({ userId: false, url: 'wss://localhost:1337' })
  }).toThrowError(/subprotocol/)
})

it('throws on missed user ID', function () {
  expect(function () {
    new Client({ subprotocol: '1.0.0', url: 'wss://localhost:1337' })
  }).toThrowError(/userId/)
})

it('not warns on WSS', function () {
  console.error = jest.fn()
  return createDialog({
    subprotocol: '1.0.0',
    userId: false,
    url: 'wss://test.com'
  }).then(function (client) {
    expect(client.sync.connected).toBeTruthy()
    expect(console.error).not.toBeCalledWith()
  })
})

it('forces to use WSS in production domain', function () {
  console.error = jest.fn()
  return createDialog({
    subprotocol: '1.0.0',
    userId: false,
    url: 'ws://test.com'
  }).then(function (client) {
    expect(client.sync.connected).toBeFalsy()
    expect(console.error).toBeCalledWith(
      'Without SSL, old proxies can block WebSockets. ' +
      'Use WSS connection for Logux or set allowDangerousProtocol option.'
    )
  })
})

it('ignores WS with allowDangerousProtocol', function () {
  console.error = jest.fn()
  return createDialog({
    allowDangerousProtocol: true,
    subprotocol: '1.0.0',
    userId: false,
    url: 'ws://test.com'
  }).then(function (client) {
    expect(client.sync.connected).toBeTruthy()
    expect(console.error).not.toBeCalledWith()
  })
})

it('ignores WS in development', function () {
  console.error = jest.fn()
  return createDialog({
    subprotocol: '1.0.0',
    userId: false,
    url: 'ws://test.com'
  }, {
    env: 'development'
  }).then(function (client) {
    expect(client.sync.connected).toBeTruthy()
    expect(console.error).not.toBeCalledWith()
  })
})

it('uses user ID in node ID', function () {
  var client1 = new Client({
    subprotocol: '1.0.0',
    userId: 10,
    url: 'wss://localhost:1337'
  })
  expect(client1.id).toBeDefined()
  expect(client1.nodeId).toEqual('10:' + client1.id)

  var client2 = new Client({
    subprotocol: '1.0.0',
    userId: false,
    url: 'wss://localhost:1337'
  })
  expect(client2.nodeId).not.toMatch(/:/)
})

it('uses node ID in ID generator', function () {
  var client = createClient()
  var id = client.log.generateId()
  expect(typeof id[0]).toEqual('number')
  expect(id[1]).toEqual(client.nodeId)
  expect(id[2]).toBe(0)
})

it('uses custom store', function () {
  var store = new MemoryStore()
  var client = new Client({
    subprotocol: '1.0.0',
    userId: false,
    store: store,
    url: 'wss://localhost:1337'
  })
  expect(client.log.store).toBe(store)
})

it('uses user ID in store name', function () {
  global.indexedDB = fakeIndexedDB
  var client = new Client({
    subprotocol: '1.0.0',
    userId: 10,
    url: 'wss://localhost:1337'
  })
  expect(client.log.store.name).toEqual('logux:10')
})

it('uses custom prefix', function () {
  global.indexedDB = fakeIndexedDB
  var client = new Client({
    subprotocol: '1.0.0',
    prefix: 'app',
    userId: 10,
    url: 'wss://localhost:1337'
  })
  expect(client.log.store.name).toEqual('app:10')
})

it('sends options to connection', function () {
  var client = new Client({
    subprotocol: '1.0.0',
    minDelay: 100,
    maxDelay: 500,
    attempts: 5,
    userId: false,
    url: 'wss://localhost:1337'
  })
  expect(client.sync.connection.options).toEqual({
    minDelay: 100,
    maxDelay: 500,
    attempts: 5
  })
  expect(client.sync.connection.connection.url).toEqual('wss://localhost:1337')
})

it('sends options to sync', function () {
  var client = new Client({
    subprotocol: '1.0.0',
    credentials: 'token',
    timeout: 2000,
    userId: false,
    ping: 1000,
    url: 'wss://localhost:1337'
  })
  expect(client.sync.options.subprotocol).toEqual('1.0.0')
  expect(client.sync.options.credentials).toEqual('token')
  expect(client.sync.options.timeout).toEqual(2000)
  expect(client.sync.options.ping).toEqual(1000)
})

it('connects', function () {
  var client = createClient()
  client.sync.connection.connect = jest.fn()
  client.start()
  expect(client.sync.connection.connect).toHaveBeenCalled()
})

it('display server debug error stacktrace with prefix', function () {
  console.error = jest.fn()
  var client = createClient()
  client.sync.emitter.emit('debug', 'error', 'Fake stacktrace\n')
  expect(console.error).toHaveBeenCalledWith(
    'Error on Logux server:\n',
    'Fake stacktrace\n'
  )
})

it('does not display server debug message if type is not error', function () {
  console.error = jest.fn()
  var client = createClient()
  client.sync.emitter.emit('debug', 'notError', 'Fake stacktrace\n')
  expect(console.error).not.toHaveBeenCalled()
})

it('cleans everything', function () {
  global.indexedDB = fakeIndexedDB
  var client = createClient()
  client.sync.destroy = jest.fn()
  client.log.store.clean = jest.fn(client.log.store.clean)
  return client.clean().then(function () {
    expect(client.sync.destroy).toHaveBeenCalled()
    expect(client.log.store.clean).toHaveBeenCalled()
  })
})

it('pings after tab-specific action', function () {
  global.localStorage = fakeLocalStorage
  var client = createClient()
  var id = client.id
  client.options.prefix = 'test'
  client.sync.connection.connect = function () { }

  client.start()
  expect(localStorage.getItem('test:tab:' + id)).not.toBeDefined()

  var prev
  return client.log.add({ type: 'A' }, { tab: id }).then(function () {
    expect(localStorage.getItem('test:tab:' + id)).toBeDefined()
    prev = localStorage.getItem('test:tab:' + id)
    return wait(client.tabPing)
  }).then(function () {
    expect(localStorage.getItem('test:tab:' + id)).toBeGreaterThan(prev)
  })
})

it('cleans own actions on destroy', function () {
  global.localStorage = fakeLocalStorage
  var client = createClient()
  var meta = { tab: client.id, reasons: ['tab' + client.id] }

  client.start()
  return client.log.add({ type: 'A' }, meta).then(function () {
    client.destroy()
    return wait(1)
  }).then(function () {
    expect(client.log.store.created.length).toEqual(0)
    expect(localStorage.getItem('test:tab:' + client.id)).not.toBeDefined()
  })
})

it('cleans own actions on unload', function () {
  global.localStorage = fakeLocalStorage
  var client = createClient()
  var meta = { tab: client.id, reasons: ['tab' + client.id] }

  client.start()
  return client.log.add({ type: 'A' }, meta).then(function () {
    window.dispatchEvent(new Event('unload'))
    return wait(1)
  }).then(function () {
    expect(client.log.store.created.length).toEqual(0)
    expect(localStorage.getItem('test:tab:' + client.id)).not.toBeDefined()
  })
})

it('cleans other tab action after timeout', function () {
  global.localStorage = fakeLocalStorage
  var client = createClient()

  return Promise.all([
    client.log.add({ type: 'A' }, { tab: '1', reasons: ['tab1'] }),
    client.log.add({ type: 'B' }, { tab: '2', reasons: ['tab2'] })
  ]).then(function () {
    localStorage.setItem('logux:tab:1', Date.now() - client.tabTimeout - 1)
    localStorage.setItem('logux:tab:2', Date.now() - client.tabTimeout + 100)
    client.start()
    return wait(1)
  }).then(function () {
    expect(client.log.store.created.length).toEqual(1)
    expect(client.log.store.created[0][0]).toEqual({ type: 'B' })
    expect(localStorage.getItem('test:tab:2')).not.toBeDefined()
  })
})
