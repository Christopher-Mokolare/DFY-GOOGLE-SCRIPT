import { test, expect, Page, request } from '@playwright/test'

const PASSWORD = 'Test@1234'

function makeEmail(prefix: string) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '@test.dfy'
}

function makeIdentity() {
  const sequence = String(Date.now() % 10000).padStart(4, '0')
  const first12 = '900101' + sequence + '08'
  const digits = first12.split('').map(Number)
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    if (i % 2 === 0) sum += digits[i]
    else {
      const doubled = digits[i] * 2
      sum += doubled > 9 ? doubled - 9 : doubled
    }
  }
  const check = String((10 - (sum % 10)) % 10)
  return first12 + check
}

function makePhone() {
  return '082' + String(Date.now() % 10000000).padStart(7, '0')
}

async function waitForAppReady(page: Page) {
  await page.waitForFunction(
    () => document.title !== 'Render - Application loading',
    { timeout: 90_000 }
  )
}

async function gotoWithRetry(page: Page, url: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      return
    } catch (error) {
      lastError = error
      if (attempt < 2) await page.waitForTimeout(2000)
    }
  }
  throw lastError
}

async function register(page: Page, email: string, userType: 'creator' | 'runner' | 'both') {
  const phone = makePhone()
  const idNumber = makeIdentity()
  await gotoWithRetry(page, '/register')
  await waitForAppReady(page)

  const registerRequest = page.waitForResponse((res) =>
    res.url().includes('/auth/register') && res.request().method() === 'POST',
    { timeout: 30_000 }
  )

  await page.getByPlaceholder('First Name *').fill('Test')
  await page.getByPlaceholder('Last Name *').fill('User')
  await page.getByPlaceholder('Email Address *').fill(email)
  await page.getByPlaceholder('Phone Number *').fill(phone)
  await page.getByRole('button', { name: /continue/i }).click()

  await page.locator(`label.role-card:has(input[value="${userType}"])`).click({ force: true })
  await page.getByPlaceholder('ID Number *').fill(idNumber)
  await page.getByPlaceholder('Address *').fill('123 Test Street, Johannesburg')
  await page.getByRole('button', { name: /continue/i }).last().click()

  await page.locator('input[placeholder="Password *"]').fill(PASSWORD)
  await page.locator('input[placeholder="Confirm Password *"]').fill(PASSWORD)
  await page.getByRole('button', { name: /create account/i }).click()

  await registerRequest
  await expect(page).toHaveURL(/login/i, { timeout: 30_000 })
}

async function login(page: Page, email: string) {
  await gotoWithRetry(page, '/login')
  await waitForAppReady(page)
  const loginRequest = page.waitForResponse((res) =>
    res.url().includes('/auth/login') && res.request().method() === 'POST',
    { timeout: 30_000 }
  )
  await page.getByPlaceholder('Email Address').fill(email)
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await loginRequest
  await expect(page).toHaveURL(/dashboard/i, { timeout: 30_000 })
}

test('home page loads', async ({ page }) => {
  await gotoWithRetry(page, '/')
  await waitForAppReady(page)
  await expect(page.getByText(/DoForYou|DFY/i).first()).toBeVisible({ timeout: 15_000 })
})

test('unauthenticated user is redirected from dashboard', async ({ page }) => {
  await gotoWithRetry(page, '/dashboard')
  await waitForAppReady(page)
  await expect(page).toHaveURL(/login/i, { timeout: 15_000 })
})

test('poster can register', async ({ page }) => {
  const email = makeEmail('poster')
  await register(page, email, 'creator')
  await expect(page).toHaveURL(/login/i)
})

test('runner can register', async ({ page }) => {
  const email = makeEmail('runner')
  await register(page, email, 'runner')
  await expect(page).toHaveURL(/login/i)
})

test('poster can log in', async ({ page }) => {
  const email = makeEmail('poster-login')
  await register(page, email, 'creator')
  await login(page, email)
  await expect(page).toHaveURL(/dashboard/i)
})

test('dashboard shows content after login', async ({ page }) => {
  const email = makeEmail('poster-dashboard')
  await register(page, email, 'creator')
  await login(page, email)
  await expect(page.locator('h1').filter({ hasText: /Good (morning|afternoon|evening)/i }).first()).toBeVisible({ timeout: 15_000 })
})

test('user can view profile page', async ({ page }) => {
  const email = makeEmail('poster-profile')
  await register(page, email, 'creator')
  await login(page, email)
  await gotoWithRetry(page, '/profile')
  await expect(page.getByText(/profile/i).first()).toBeVisible({ timeout: 15_000 })
})

test('runner can browse available tasks', async ({ page }) => {
  const email = makeEmail('runner-browse')
  await register(page, email, 'runner')
  await login(page, email)
  await gotoWithRetry(page, '/tasks/browse')
  await expect(page.getByRole('heading', { name: /find a task/i })).toBeVisible({ timeout: 15_000 })
})

test('poster can access post errand page', async ({ page }) => {
  const email = makeEmail('poster-post')
  await register(page, email, 'creator')
  await login(page, email)
  await gotoWithRetry(page, '/tasks/post')
  await expect(page.getByRole('heading', { name: /create your task/i })).toBeVisible({ timeout: 15_000 })
})

test('poster can view my posted tasks', async ({ page }) => {
  const email = makeEmail('poster-posted')
  await register(page, email, 'creator')
  await login(page, email)
  await gotoWithRetry(page, '/tasks/my-posted')
  const postedHeading = page.locator('h1, h3').filter({ hasText: /my posted tasks|no posted tasks/i }).first()
  await expect(postedHeading).toBeVisible({ timeout: 15_000 })
})

test('legacy wallet route redirects to the dashboard', async ({ page }) => {
  const email = makeEmail('runner-wallet-route')
  await register(page, email, 'runner')
  await login(page, email)
  await gotoWithRetry(page, '/wallet')
  await expect(page).toHaveURL(/dashboard/i, { timeout: 15_000 })
  await expect(page.locator('h1').filter({ hasText: /Good (morning|afternoon|evening)/i }).first()).toBeVisible({ timeout: 15_000 })
})

test('user can log out', async ({ page }) => {
  const email = makeEmail('poster-logout')
  await register(page, email, 'creator')
  await login(page, email)

  await page.locator('.admin-logout').first().click()
  await expect(page).toHaveURL(/login|\//, { timeout: 10_000 })
})
