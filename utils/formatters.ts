import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatTime(date: Date): string {
  return format(date, 'HH:mm', { locale: ptBR });
}

export function formatDate(date: Date): string {
  return format(date, "d 'de' MMMM", { locale: ptBR });
}

export function formatRelative(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}
