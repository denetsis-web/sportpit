// Запросы оценки блюд. Весь доступ к серверу идёт через общий клиент API.
import {
  feedbackOrdersSchema,
  ratingResponseSchema,
  type RateInput,
} from '@sportpit/shared/schemas/feedback';
import { api } from '../../../api/index.ts';

export const fetchFeedbackOrders = () =>
  api.get('/feedback/orders', { schema: feedbackOrdersSchema });

export const rateDish = (input: RateInput) =>
  api.put('/feedback/ratings', { body: input, schema: ratingResponseSchema });
