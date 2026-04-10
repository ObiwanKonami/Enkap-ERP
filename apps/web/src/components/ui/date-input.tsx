'use client';

import { useState, useEffect } from 'react';
import { format, parse, isValid } from 'date-fns';
import { tr } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// ISO "YYYY-MM-DD" → "GG.AA.YYYY"
function isoToDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = parse(iso, 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'dd.MM.yyyy') : '';
}

// "GG.AA.YYYY" → ISO "YYYY-MM-DD" (eksikse "")
function displayToIso(display: string): string {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(display)) return '';
  const d = parse(display, 'dd.MM.yyyy', new Date());
  return isValid(d) ? format(d, 'yyyy-MM-dd') : '';
}

// Sadece rakam al, GG.AA.YYYY formatına çevir
function autoFormat(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 4) out += '.';
    out += digits[i];
  }
  return out;
}

type DateInputProps = Omit<React.ComponentProps<'input'>, 'type' | 'onChange'> & {
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

/**
 * shadcn Calendar + Popover tabanlı tarih seçici.
 * - value / onChange arayüzü <input type="date"> ile aynı (ISO "YYYY-MM-DD")
 * - Ekranda Türkçe "GG.AA.YYYY" formatı gösterir
 * - Takvim ikonuna tıklayınca Türkçe takvim açılır
 */
export function DateInput({
  value = '',
  onChange,
  className,
  disabled,
  min,
  max,
  ...rest
}: DateInputProps) {
  const isoValue = typeof value === 'string' ? value : '';
  const [display, setDisplay] = useState(() => isoToDisplay(isoValue));
  const [open, setOpen] = useState(false);

  // Dışarıdan gelen prop değişikliklerini yansıt
  useEffect(() => {
    setDisplay(isoToDisplay(isoValue));
  }, [isoValue]);

  function emit(iso: string) {
    onChange?.({ target: { value: iso } } as React.ChangeEvent<HTMLInputElement>);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = autoFormat(e.target.value);
    setDisplay(formatted);
    const iso = displayToIso(formatted);
    emit(iso);
  }

  function handleCalendarSelect(date: Date | undefined) {
    if (!date) return;
    const iso = format(date, 'yyyy-MM-dd');
    setDisplay(format(date, 'dd.MM.yyyy'));
    emit(iso);
    setOpen(false);
  }

  const selectedDate = isoValue
    ? parse(isoValue, 'yyyy-MM-dd', new Date())
    : undefined;

  const minDate = min ? parse(min, 'yyyy-MM-dd', new Date()) : undefined;
  const maxDate = max ? parse(max, 'yyyy-MM-dd', new Date()) : undefined;

  return (
    <div className="relative">
      <input
        {...rest}
        type="text"
        value={display}
        onChange={handleTextChange}
        disabled={disabled}
        placeholder="GG.AA.YYYY"
        maxLength={10}
        inputMode="numeric"
        className={cn(
          'h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 py-0.5 pr-8',
          'text-sm tabular-nums transition-colors outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
          'dark:bg-input/30 md:text-xs/relaxed',
          className,
        )}
      />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Takvimi aç"
          >
            <CalendarDays size={13} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={isValid(selectedDate) ? selectedDate : undefined}
            onSelect={handleCalendarSelect}
            locale={tr}
            captionLayout="dropdown"
            disabled={(date) => {
              if (minDate && isValid(minDate) && date < minDate) return true;
              if (maxDate && isValid(maxDate) && date > maxDate) return true;
              return false;
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
