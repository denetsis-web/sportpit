// Запросы раздела «Поддержка» и формы жалобы.
import {
  complaintResponseSchema,
  feedbackOrdersSchema,
  supportSchema,
} from '@sportpit/shared/schemas/feedback';
import { api } from '../../../api/index.ts';

export const fetchSupport = () => api.get('/feedback/support', { schema: supportSchema });

export const fetchComplaintOrders = () =>
  api.get('/feedback/orders', { schema: feedbackOrdersSchema });

/** Жалоба уходит формой multipart: поля и необязательный файл `photo`. */
export const sendComplaint = (form: FormData) =>
  api.post('/feedback/complaints', { body: form, schema: complaintResponseSchema });
