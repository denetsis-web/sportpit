// Запросы профиля и анкеты: весь доступ к серверу через общий клиент API.
import {
  phoneChangeResponseSchema,
  profileResponseSchema,
  type ProfileInput,
  type ProfileResponse,
} from '@sportpit/shared/schemas/profile';
import { api } from '../../../api/index.ts';

export const loadProfile = (): Promise<ProfileResponse> =>
  api.get('/profile', { schema: profileResponseSchema });

export const saveProfile = (input: ProfileInput): Promise<ProfileResponse> =>
  api.put('/profile', { body: input, schema: profileResponseSchema });

export const requestPhoneCode = (phone: string): Promise<unknown> =>
  api.post('/profile/phone/request', { body: { phone } });

export const confirmPhone = (phone: string, code: string) =>
  api.post('/profile/phone', { body: { phone, code }, schema: phoneChangeResponseSchema });

export const exportData = (): Promise<unknown> => api.get('/profile/export');

export const deleteAccount = (): Promise<unknown> =>
  api.post('/profile/account/delete', { body: { confirm: true } });
