import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { Banner, Button, Card, Dialog, TextField } from '../src/ui/index.ts';

describe('общие компоненты ui: автопроверка доступности (axe)', () => {
  it('кнопки всех видов, в том числе занятая и отключённая', async () => {
    const { container } = render(
      <div>
        <Button>Купить</Button>
        <Button variant="secondary">Отмена</Button>
        <Button variant="danger">Удалить</Button>
        <Button variant="ghost">Ещё</Button>
        <Button loading>Идёт запрос</Button>
        <Button disabled>Недоступно</Button>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('поле с подписью, подсказкой и ошибкой', async () => {
    const { container } = render(
      <form>
        <TextField label="Телефон" hint="Формат +373XXXXXXXX" />
        <TextField label="Код" error="Неверный код" defaultValue="12" />
      </form>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('карточка с заголовком и баннеры всех видов', async () => {
    const { container } = render(
      <main>
        <h1>Страница</h1>
        <Card title="Заголовок карточки">Текст</Card>
        <Banner variant="info">Инфо</Banner>
        <Banner variant="success">Готово</Banner>
        <Banner variant="warning">Внимание</Banner>
        <Banner variant="error" action={<Button>Повторить</Button>}>
          Ошибка
        </Banner>
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('открытый диалог', async () => {
    render(
      <Dialog open onClose={() => undefined} title="Подтверждение" closeLabel="Закрыть">
        <p>Вы уверены?</p>
      </Dialog>,
    );
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('Button', () => {
  it('по умолчанию type=button и не отправляет форму', async () => {
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Нажми</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Нажми' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('занятая кнопка недоступна, не реагирует на клик и сообщает aria-busy', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Оплатить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Оплатить' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('подпись связана с полем, ошибка и подсказка читаются как описание', () => {
    render(<TextField label="Телефон" hint="Формат +373XXXXXXXX" error="Неверный номер" />);
    const input = screen.getByLabelText('Телефон');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const description = input.getAttribute('aria-describedby')!.split(' ');
    expect(description).toHaveLength(2);
    expect(document.getElementById(description[1]!)!.textContent).toBe('Неверный номер');
    expect(screen.getByRole('alert').textContent).toBe('Неверный номер');
  });

  it('без ошибки поле не помечено неверным', () => {
    render(<TextField label="Имя" />);
    expect(screen.getByLabelText('Имя').hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('Banner', () => {
  it('ошибка объявляется сразу (alert), остальное вежливо (status)', () => {
    render(
      <>
        <Banner variant="error">Сбой</Banner>
        <Banner variant="info">Совет</Banner>
      </>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Сбой');
    expect(screen.getByRole('status').textContent).toBe('Совет');
  });
});

describe('Dialog', () => {
  function Host({ dismissible = true }: { dismissible?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Открыть</button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Заголовок окна"
          closeLabel="Закрыть"
          dismissible={dismissible}
          actions={<Button>Подтвердить</Button>}
        >
          <TextField label="Комментарий" />
        </Dialog>
      </>
    );
  }

  it('имеет роль dialog, подпись по заголовку и переносит фокус внутрь', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    const dialog = screen.getByRole('dialog', { name: 'Заголовок окна' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Tab не выходит за пределы окна, а Esc закрывает и возвращает фокус на кнопку', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Открыть' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('кнопка «Закрыть» закрывает окно; недопустимо закрываемое окно Esc не закрывает', async () => {
    const user = userEvent.setup();
    render(<Host dismissible={false} />);
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
