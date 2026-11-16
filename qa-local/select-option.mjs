import assert from 'node:assert/strict'
export async function selectOption(page, trigger, value) {
  if (await trigger.evaluate((node)=>node.tagName==='SELECT')) return trigger.selectOption(String(value))
  await trigger.click()
  const list=page.getByRole('listbox')
  await list.waitFor()
  const target=list.locator(`[role="option"][data-value=${JSON.stringify(String(value))}]`)
  await target.click()
  await list.waitFor({state:'hidden'})
  assert.equal(await trigger.getAttribute('data-value'),String(value))
}
