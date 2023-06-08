import { faker } from '@faker-js/faker'

let agentIdentifier
let agentSession
let mockEE

beforeEach(() => {
  agentIdentifier = faker.datatype.uuid()
  mockEE = { [faker.datatype.uuid()]: faker.lorem.sentence() }
  agentSession = {
    [faker.datatype.uuid()]: faker.lorem.sentence(),
    state: {
      [faker.datatype.uuid()]: faker.lorem.sentence()
    }
  }

  jest.doMock('../../common/config/config', () => ({
    __esModule: true,
    getConfigurationValue: jest.fn(),
    getInfo: jest.fn(),
    getRuntime: jest.fn().mockImplementation(() => ({ session: agentSession })),
    setInfo: jest.fn()
  }))
  jest.doMock('../../common/drain/drain', () => ({
    __esModule: true,
    drain: jest.fn()
  }))
  jest.doMock('../../common/event-emitter/contextual-ee', () => ({
    __esModule: true,
    ee: {
      get: jest.fn().mockReturnValue(mockEE)
    }
  }))
  jest.mock('../../common/event-emitter/register-handler', () => ({
    __esModule: true,
    registerHandler: jest.fn()
  }))
  jest.doMock('../../common/util/global-scope', () => ({
    __esModule: true,
    isBrowserScope: true
  }))
  jest.doMock('../../common/session/session-entity', () => ({
    __esModule: true,
    SessionEntity: jest.fn().mockReturnValue({
      state: agentSession.state
    })
  }))
  jest.doMock('../../common/storage/local-storage.js', () => ({
    __esModule: true,
    LocalStorage: jest.fn()
  }))
  jest.doMock('../../common/storage/first-party-cookies', () => ({
    __esModule: true,
    FirstPartyCookies: jest.fn()
  }))
})

afterEach(() => {
  jest.resetModules()
})

test('should register handlers and drain the session feature', async () => {
  const { setupAgentSession } = await import('./agent-session')
  const result = setupAgentSession(agentIdentifier)

  const { registerHandler } = await import('../../common/event-emitter/register-handler')
  const { drain } = await import('../../common/drain/drain')

  expect(result).toEqual(agentSession)
  expect(registerHandler).toHaveBeenNthCalledWith(1, 'api-setCustomAttribute', expect.any(Function), 'session', mockEE)
  expect(registerHandler).toHaveBeenNthCalledWith(2, 'api-setUserId', expect.any(Function), 'session', mockEE)
  expect(drain).toHaveBeenCalledWith(agentIdentifier, 'session')
})

test('should not drain the session feature more than once', async () => {
  const { setupAgentSession } = await import('./agent-session')
  const result1 = setupAgentSession(agentIdentifier)
  const result2 = setupAgentSession(agentIdentifier)

  const { registerHandler } = await import('../../common/event-emitter/register-handler')
  const { drain } = await import('../../common/drain/drain')

  expect(result1).toEqual(result2)
  expect(result1).toEqual(agentSession)
  expect(registerHandler).toHaveBeenCalledTimes(2)
  expect(drain).toHaveBeenCalledTimes(1)
})

test('should use the local storage class and instantiate a new session when cookies are enabled', async () => {
  const expiresMs = faker.datatype.number()
  const inactiveMs = faker.datatype.number()
  const { getConfigurationValue } = await import('../../common/config/config')
  jest.mocked(getConfigurationValue).mockImplementation((_, setting) => {
    if (setting === 'privacy.cookies_enabled') {
      return true
    }
    if (setting === 'session.expiresMs') {
      return expiresMs
    }
    if (setting === 'session.inactiveMs') {
      return inactiveMs
    }
  })

  const { LocalStorage } = await import('../../common/storage/local-storage')
  const { SessionEntity } = await import('../../common/session/session-entity')
  const { setupAgentSession } = await import('./agent-session')
  setupAgentSession(agentIdentifier)

  expect(LocalStorage).toHaveBeenCalledTimes(1)
  expect(SessionEntity).toHaveBeenCalledWith({
    agentIdentifier,
    key: 'SESSION',
    storageAPI: expect.any(LocalStorage),
    expiresMs,
    inactiveMs
  })
})

test('should use the first party cookie storage class and instantiate a new session when cookies are enabled and a domain is set', async () => {
  const expiresMs = faker.datatype.number()
  const inactiveMs = faker.datatype.number()
  const domain = faker.internet.domainName()
  const { getConfigurationValue } = await import('../../common/config/config')
  jest.mocked(getConfigurationValue).mockImplementation((_, setting) => {
    if (setting === 'privacy.cookies_enabled') {
      return true
    }
    if (setting === 'session.expiresMs') {
      return expiresMs
    }
    if (setting === 'session.inactiveMs') {
      return inactiveMs
    }
    if (setting === 'session.domain') {
      return domain
    }
  })

  const { FirstPartyCookies } = await import('../../common/storage/first-party-cookies')
  const { SessionEntity } = await import('../../common/session/session-entity')
  const { setupAgentSession } = await import('./agent-session')
  setupAgentSession(agentIdentifier)

  expect(FirstPartyCookies).toHaveBeenCalledTimes(1)
  expect(SessionEntity).toHaveBeenCalledWith({
    agentIdentifier,
    key: 'SESSION',
    storageAPI: expect.any(FirstPartyCookies),
    expiresMs,
    inactiveMs
  })
})

test('should set custom session data', async () => {
  const { getInfo, setInfo } = await import('../../common/config/config')
  const agentInfo = {
    [faker.datatype.uuid()]: faker.lorem.sentence(),
    jsAttributes: {
      [faker.datatype.uuid()]: faker.lorem.sentence()
    }
  }
  jest.mocked(getInfo).mockReturnValue(agentInfo)
  agentSession.state.custom = {
    [faker.datatype.uuid()]: faker.lorem.sentence()
  }

  const { setupAgentSession } = await import('./agent-session')
  setupAgentSession(agentIdentifier)

  expect(setInfo).toHaveBeenCalledWith(agentIdentifier, {
    ...agentInfo,
    jsAttributes: {
      ...agentInfo.jsAttributes,
      ...agentSession.state.custom
    }
  })
})

test('should not set custom session data in worker scope', async () => {
  const globalScope = await import('../../common/util/global-scope')
  jest.replaceProperty(globalScope, 'isBrowserScope', false)

  const { setInfo } = await import('../../common/config/config')
  const { setupAgentSession } = await import('./agent-session')
  setupAgentSession(agentIdentifier)

  expect(setInfo).not.toHaveBeenCalled()
})

test('should sync custom attributes', async () => {
  const { registerHandler } = await import('../../common/event-emitter/register-handler')
  agentSession.syncCustomAttribute = jest.fn()

  const customProps = [
    [faker.date.recent(), faker.datatype.uuid(), faker.lorem.sentence()],
    [faker.date.recent(), faker.datatype.uuid(), faker.lorem.sentence()]
  ]

  const { setupAgentSession } = await import('./agent-session')
  setupAgentSession(agentIdentifier)

  const setCustomAttributeHandler = jest.mocked(registerHandler).mock.calls[0][1]
  const setUserIdHandler = jest.mocked(registerHandler).mock.calls[1][1]

  setCustomAttributeHandler(...customProps[0])
  setUserIdHandler(...customProps[1])

  expect(agentSession.syncCustomAttribute).toHaveBeenNthCalledWith(1, customProps[0][1], customProps[0][2])
  expect(agentSession.syncCustomAttribute).toHaveBeenNthCalledWith(2, customProps[1][1], customProps[1][2])
})