import type { MeResponse } from '@/features/auth/api'
import { MOCK_CITIES, MOCK_NEW_USER } from './data'
import type { MockOrganization, MockUser } from './data'
import { getDb, getSession, saveDb, setSession } from './db'

export interface MockResult {
  status: number
  data?: unknown
}

type Params = Record<string, unknown>
type Body = Record<string, unknown>

const ok = (data?: unknown, status = 200): MockResult => ({ status, data })
const fail = (status: number, detail: unknown): MockResult => ({
  status,
  data: { detail },
})
const fieldError = (
  status: number,
  field: string,
  type: string,
  msg: string,
): MockResult => fail(status, [{ type, loc: ['body', field], msg }])

const NOT_AUTHENTICATED = fail(401, 'Not authenticated')

const currentUser = (): MockUser | null => {
  const session = getSession()
  if (session?.kind !== 'user') return null
  return getDb().users.find((user) => user.id === session.userId) ?? null
}

const membershipOf = (userId: number) => {
  const db = getDb()
  const membership = db.memberships.find((m) => m.user_id === userId)
  if (!membership) return null
  const organization = db.organizations.find(
    (org) => org.id === membership.organization_id,
  )
  return organization ? { membership, organization } : null
}

const toListItem = ({ edrpou: _edrpou, ...item }: MockOrganization) => item

const toProfile = (organization: MockOrganization, role: string) => ({
  id: organization.id,
  name: organization.name,
  email: organization.email,
  phone: organization.phone,
  city_id: organization.city_id,
  description: organization.description,
  edrpou: organization.edrpou,
  status: organization.status,
  created_at: organization.created_at,
  role,
})

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

// ---- /auth

const getMe = (): MockResult => {
  const session = getSession()
  if (!session) return NOT_AUTHENTICATED

  if (session.kind === 'new') {
    const response: MeResponse = {
      status: 'registration_required',
      ...MOCK_NEW_USER,
    }
    return ok(response)
  }

  const user = currentUser()
  if (!user) return NOT_AUTHENTICATED
  const membership = membershipOf(user.id)
  const response: MeResponse = {
    status: 'authenticated',
    user: { ...user },
    organization: membership
      ? {
          id: membership.organization.id,
          name: membership.organization.name,
          status: membership.organization.status,
          role: membership.membership.role,
        }
      : null,
  }
  return ok(response)
}

const register = (body: Body): MockResult => {
  if (getSession()?.kind !== 'new') {
    return fail(401, 'Registration expired, sign in with Google again')
  }
  const db = getDb()

  const cityId = Number(body.city_id)
  if (!MOCK_CITIES.some((city) => city.id === cityId)) {
    return fieldError(422, 'city_id', 'city_not_found', 'City not found')
  }

  const firstName = asString(body.first_name)
  const lastName = asString(body.last_name)
  const nickname = (
    asString(body.nickname) || `${firstName}_${lastName}`
  ).toLowerCase()
  if (db.users.some((user) => user.nickname === nickname)) {
    return fieldError(
      409,
      'nickname',
      'nickname_taken',
      'Nickname is already taken',
    )
  }

  const user: MockUser = {
    id: db.nextUserId++,
    email: MOCK_NEW_USER.email,
    first_name: firstName,
    last_name: lastName,
    nickname,
    phone: asString(body.phone),
    birth_date: asString(body.birth_date),
    gender: (body.gender as MockUser['gender']) ?? 'prefer_not_to_say',
    bio: asString(body.bio) || null,
    platform_role: 'user',
  }
  db.users.push(user)
  saveDb()
  setSession({ kind: 'user', userId: user.id })
  return ok(user, 201)
}

const logout = (): MockResult => {
  setSession(null)
  return ok(undefined, 204)
}

// ---- /cities

const listCities = (): MockResult => ok(MOCK_CITIES)

// ---- /organizations

const listOrganizations = (params: Params): MockResult => {
  const cityId = params.city_id ? Number(params.city_id) : null
  const limit = params.limit ? Number(params.limit) : 20
  const offset = params.offset ? Number(params.offset) : 0

  // Як і бекенд: лише схвалені, нові спершу
  const items = getDb()
    .organizations.filter(
      (org) =>
        org.status === 'approved' &&
        (cityId === null || org.city_id === cityId),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
    .slice(offset, offset + limit)
    .map(toListItem)
  return ok(items)
}

const createOrganization = (body: Body): MockResult => {
  const user = currentUser()
  if (!user) return NOT_AUTHENTICATED
  const db = getDb()

  if (membershipOf(user.id)) {
    return fail(409, 'User already belongs to an organization')
  }
  const cityId = Number(body.city_id)
  if (!MOCK_CITIES.some((city) => city.id === cityId)) {
    return fieldError(422, 'city_id', 'city_not_found', 'City not found')
  }
  const edrpou = asString(body.edrpou) || null
  if (edrpou && db.organizations.some((org) => org.edrpou === edrpou)) {
    return fieldError(
      409,
      'edrpou',
      'edrpou_taken',
      'Organization with this EDRPOU code is already registered',
    )
  }

  const organization: MockOrganization = {
    id: db.nextOrganizationId++,
    name: asString(body.name),
    email: asString(body.email),
    phone: asString(body.phone),
    city_id: cityId,
    description: asString(body.description) || null,
    edrpou,
    status: 'pending',
    created_at: new Date().toISOString(),
  }
  db.organizations.push(organization)
  db.memberships.push({
    user_id: user.id,
    organization_id: organization.id,
    role: 'owner',
  })
  saveDb()
  return ok(toProfile(organization, 'owner'), 201)
}

const getMyOrganization = (): MockResult => {
  const user = currentUser()
  if (!user) return NOT_AUTHENTICATED
  const found = membershipOf(user.id)
  if (!found) return fail(404, 'User does not belong to an organization')
  return ok(toProfile(found.organization, found.membership.role))
}

const updateMyOrganization = (body: Body): MockResult => {
  const user = currentUser()
  if (!user) return NOT_AUTHENTICATED
  const found = membershipOf(user.id)
  if (!found) return fail(404, 'User does not belong to an organization')
  if (found.membership.role === 'member') {
    return fail(403, 'Only the owner or an admin can edit the organization')
  }
  if (found.organization.status === 'blocked') {
    return fail(403, 'Organization is blocked')
  }

  const { organization } = found
  if (typeof body.email === 'string') organization.email = body.email
  if (typeof body.phone === 'string') organization.phone = body.phone
  if (body.city_id !== undefined) organization.city_id = Number(body.city_id)
  if (body.description !== undefined) {
    organization.description = asString(body.description) || null
  }
  saveDb()
  return ok(toProfile(organization, found.membership.role))
}

/** Маршрутизатор тестового API: той самий контракт, що й у бекенду. */
export const handleRequest = (
  method: string,
  path: string,
  params: Params,
  body: Body,
): MockResult => {
  const route = `${method.toUpperCase()} ${path.replace(/\/+$/, '')}`
  switch (route) {
    case 'GET /auth/me':
      return getMe()
    case 'POST /auth/register':
      return register(body)
    case 'POST /auth/logout':
      return logout()
    case 'GET /cities':
      return listCities()
    case 'GET /organizations':
      return listOrganizations(params)
    case 'POST /organizations':
      return createOrganization(body)
    case 'GET /organizations/me':
      return getMyOrganization()
    case 'PATCH /organizations/me':
      return updateMyOrganization(body)
    default:
      return fail(404, `Mock API: ${route} is not implemented`)
  }
}
