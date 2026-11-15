// Shared test helper: goes through the opening flow like a player (welcome → mode → SẴN SÀNG → countdown → tour).
export async function onboard(page, mode = 'advanced') {
  await page.waitForSelector('.onb-card', { timeout: 60000 })
  await page.getByRole('button', { name: /Tiếp tục/ }).first().click()
  await page.locator('.story-modes button', { hasText: mode === 'basic' ? 'Cơ bản' : 'Nâng cao' }).click()
  await page.getByRole('button', { name: /SẴN SÀNG/ }).click()
  await page.locator('.onb-skip').click({ timeout: 5000 }).catch(() => null)
  await page.waitForSelector('.onb-cinematic', { state: 'detached', timeout: 10000 })
  for (let i = 0; i < 60; i++) {
    const next = page.locator('#action-dock .dialogue-action')
    if (await page.locator('.story-decision').count()) return
    if (!(await next.count())) { await page.waitForTimeout(400); continue }
    await next.first().click({ timeout: 3000 }).catch(() => null)
    await page.waitForTimeout(250)
  }
}
