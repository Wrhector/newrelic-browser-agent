import { faker } from '@faker-js/faker'

describe('Content Security Policy', () => {
  it('should support a nonce script element', async () => {
    const nonce = faker.datatype.uuid()
    await Promise.all([
      browser.testHandle.expectRum(),
      browser.url(await browser.testHandle.assetURL('instrumented.html', { nonce }))
        .then(() => browser.waitForAgentLoad())
    ])

    const foundNonce = await browser.execute(function () {
      var scriptTags = document.querySelectorAll('script')
      var nonceValues = []
      for (let i = 0; i < scriptTags.length; i++) {
        nonceValues.push(scriptTags[i].nonce)
      }
      return nonceValues
    })

    expect(foundNonce).toEqual([nonce, nonce, nonce])
  })

  it('should load async chunk with subresource integrity', async () => {
    await Promise.all([
      browser.testHandle.expectRum(),
      browser.url(await browser.testHandle.assetURL('subresource-integrity-capture.html'))
        .then(() => browser.waitForAgentLoad())
    ])

    const foundIntegrityValues = await browser.execute(function () {
      return window.chunkIntegratyValues
    })

    expect(foundIntegrityValues.length).toEqual(1)
    expect(foundIntegrityValues[0]).toMatch(/^sha512-[a-zA-Z0-9=/+]+$/)
  })
})
