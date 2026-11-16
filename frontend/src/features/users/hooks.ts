import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_ME_QUERY_KEY } from '@/features/auth/hooks'
import { getMyProfile, updateMyProfile } from './api'

export const MY_PROFILE_QUERY_KEY = ['users', 'me'] as const

/** Повні дані анкети з GET /users/me (у /auth/me, наприклад, немає міста). */
export const useMyProfile = () =>
  useQuery({
    queryKey: MY_PROFILE_QUERY_KEY,
    queryFn: getMyProfile,
  })

/** Зберігає анкету й оновлює /auth/me: ім’я в шапці та меню беруться звідти. */
export const useUpdateMyProfile = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateMyProfile,
    onSuccess: async (profile) => {
      queryClient.setQueryData(MY_PROFILE_QUERY_KEY, profile)
      await queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY })
    },
  })
}
