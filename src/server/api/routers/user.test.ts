import { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCaller } from '~/server/api/root'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

const TEST_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const OTHER_USER_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'

function createPublicCaller() {
  return createCaller({
    db: getTestDb(),
    user: null,
    headers: new Headers(),
  })
}

function createAuthenticatedCaller(userId = TEST_USER_ID) {
  return createCaller({
    db: getTestDb(),
    // biome-ignore lint/suspicious/noExplicitAny: mock Supabase user for testing
    user: { id: userId } as any,
    headers: new Headers(),
  })
}

describe('User Router', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('createProfile', () => {
    it('should create a profile with valid input', async () => {
      const caller = createPublicCaller()

      const profile = await caller.user.createProfile({
        id: TEST_USER_ID,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        birthDate: '1990-01-01',
      })

      expect(profile).toBeDefined()
      expect(profile?.email).toBe('test@example.com')
      expect(profile?.firstName).toBe('Test')
      expect(profile?.lastName).toBe('User')
      expect(profile?.birthDate).toBe('1990-01-01')
      expect(profile?.role).toBe('attendee')
      expect(profile?.createdAt).toBeInstanceOf(Date)
    })

    it('should reject invalid UUID', async () => {
      const caller = createPublicCaller()

      await expect(
        caller.user.createProfile({
          id: 'not-a-uuid',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          birthDate: '1990-01-01',
        }),
      ).rejects.toThrow()
    })

    it('should reject invalid email', async () => {
      const caller = createPublicCaller()

      await expect(
        caller.user.createProfile({
          id: TEST_USER_ID,
          email: 'invalid-email',
          firstName: 'Test',
          lastName: 'User',
          birthDate: '1990-01-01',
        }),
      ).rejects.toThrow()
    })

    it('should reject empty first name', async () => {
      const caller = createPublicCaller()

      await expect(
        caller.user.createProfile({
          id: TEST_USER_ID,
          email: 'test@example.com',
          firstName: '',
          lastName: 'User',
          birthDate: '1990-01-01',
        }),
      ).rejects.toThrow()
    })

    it('should reject empty last name', async () => {
      const caller = createPublicCaller()

      await expect(
        caller.user.createProfile({
          id: TEST_USER_ID,
          email: 'test@example.com',
          firstName: 'Test',
          lastName: '',
          birthDate: '1990-01-01',
        }),
      ).rejects.toThrow()
    })

    it('should reject duplicate email', async () => {
      const caller = createPublicCaller()

      await caller.user.createProfile({
        id: TEST_USER_ID,
        email: 'duplicate@example.com',
        firstName: 'First',
        lastName: 'User',
        birthDate: '1990-01-01',
      })

      await expect(
        caller.user.createProfile({
          id: OTHER_USER_ID,
          email: 'duplicate@example.com',
          firstName: 'Second',
          lastName: 'User',
          birthDate: '1990-01-01',
        }),
      ).rejects.toThrow()
    })
  })

  describe('getProfile', () => {
    it('should return profile for authenticated user with existing profile', async () => {
      const publicCaller = createPublicCaller()
      await publicCaller.user.createProfile({
        id: TEST_USER_ID,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        birthDate: '1990-01-01',
      })

      const authedCaller = createAuthenticatedCaller()
      const profile = await authedCaller.user.getProfile()

      expect(profile).toBeDefined()
      expect(profile?.email).toBe('test@example.com')
      expect(profile?.firstName).toBe('Test')
      expect(profile?.lastName).toBe('User')
    })

    it('should return null for authenticated user without profile', async () => {
      const caller = createAuthenticatedCaller(OTHER_USER_ID)
      const profile = await caller.user.getProfile()

      expect(profile).toBeNull()
    })

    it('should reject unauthenticated request', async () => {
      const caller = createPublicCaller()

      try {
        await caller.user.getProfile()
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })
  })

  describe('updateProfile', () => {
    it('should update first and last name', async () => {
      const publicCaller = createPublicCaller()
      await publicCaller.user.createProfile({
        id: TEST_USER_ID,
        email: 'test@example.com',
        firstName: 'Original',
        lastName: 'Name',
        birthDate: '1990-01-01',
      })

      const authedCaller = createAuthenticatedCaller()
      const updated = await authedCaller.user.updateProfile({
        firstName: 'Updated',
        lastName: 'Person',
      })

      expect(updated.firstName).toBe('Updated')
      expect(updated.lastName).toBe('Person')
      expect(updated.email).toBe('test@example.com')
    })

    it('should not modify email or role on update', async () => {
      const publicCaller = createPublicCaller()
      await publicCaller.user.createProfile({
        id: TEST_USER_ID,
        email: 'test@example.com',
        firstName: 'Original',
        lastName: 'Name',
        birthDate: '1990-01-01',
      })

      const authedCaller = createAuthenticatedCaller()
      const updated = await authedCaller.user.updateProfile({
        firstName: 'New',
        lastName: 'Name',
      })

      expect(updated.email).toBe('test@example.com')
      expect(updated.role).toBe('attendee')
      expect(updated.birthDate).toBe('1990-01-01')
    })

    it('should reject unauthenticated request', async () => {
      const caller = createPublicCaller()

      try {
        await caller.user.updateProfile({
          firstName: 'Test',
          lastName: 'User',
        })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })

    it('should throw NOT_FOUND when profile does not exist', async () => {
      const caller = createAuthenticatedCaller(OTHER_USER_ID)

      try {
        await caller.user.updateProfile({
          firstName: 'Test',
          lastName: 'User',
        })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })

    it('should reject empty first name', async () => {
      const caller = createAuthenticatedCaller()

      await expect(
        caller.user.updateProfile({
          firstName: '',
          lastName: 'User',
        }),
      ).rejects.toThrow()
    })

    it('should reject empty last name', async () => {
      const caller = createAuthenticatedCaller()

      await expect(
        caller.user.updateProfile({
          firstName: 'Test',
          lastName: '',
        }),
      ).rejects.toThrow()
    })
  })
})
