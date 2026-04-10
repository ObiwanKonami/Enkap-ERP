'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

// ─── Ülke Listesi ─────────────────────────────────────────────────────────────

export interface Country {
  code:     string;
  dialCode: string;
  name:     string;
  flag:     string;
  mask:     string;
}

export const COUNTRIES: Country[] = [
  { code: 'TR', dialCode: '+90',  name: 'Türkiye',           flag: '🇹🇷', mask: 'XXX XXX XX XX'   },
  { code: 'DE', dialCode: '+49',  name: 'Almanya',           flag: '🇩🇪', mask: 'XXX XXXXXXXX'    },
  { code: 'AT', dialCode: '+43',  name: 'Avusturya',         flag: '🇦🇹', mask: 'XXX XXXXXXX'     },
  { code: 'BE', dialCode: '+32',  name: 'Belçika',           flag: '🇧🇪', mask: 'XXX XX XX XX'    },
  { code: 'BG', dialCode: '+359', name: 'Bulgaristan',       flag: '🇧🇬', mask: 'XX XXX XXXX'     },
  { code: 'CZ', dialCode: '+420', name: 'Çek Cumhuriyeti',   flag: '🇨🇿', mask: 'XXX XXX XXX'     },
  { code: 'DK', dialCode: '+45',  name: 'Danimarka',         flag: '🇩🇰', mask: 'XXXX XXXX'       },
  { code: 'FI', dialCode: '+358', name: 'Finlandiya',        flag: '🇫🇮', mask: 'XX XXX XXXX'     },
  { code: 'FR', dialCode: '+33',  name: 'Fransa',            flag: '🇫🇷', mask: 'X XX XX XX XX'   },
  { code: 'NL', dialCode: '+31',  name: 'Hollanda',          flag: '🇳🇱', mask: 'XX XXX XXXX'     },
  { code: 'HR', dialCode: '+385', name: 'Hırvatistan',       flag: '🇭🇷', mask: 'XX XXX XXX'      },
  { code: 'GB', dialCode: '+44',  name: 'İngiltere',         flag: '🇬🇧', mask: 'XXXX XXX XXXX'   },
  { code: 'IE', dialCode: '+353', name: 'İrlanda',           flag: '🇮🇪', mask: 'XX XXX XXXX'     },
  { code: 'ES', dialCode: '+34',  name: 'İspanya',           flag: '🇪🇸', mask: 'XXX XXX XXX'     },
  { code: 'SE', dialCode: '+46',  name: 'İsveç',             flag: '🇸🇪', mask: 'XX XXX XXXX'     },
  { code: 'CH', dialCode: '+41',  name: 'İsviçre',           flag: '🇨🇭', mask: 'XX XXX XX XX'    },
  { code: 'IT', dialCode: '+39',  name: 'İtalya',            flag: '🇮🇹', mask: 'XXX XXX XXXX'    },
  { code: 'LU', dialCode: '+352', name: 'Lüksemburg',        flag: '🇱🇺', mask: 'XXX XXX XXX'     },
  { code: 'HU', dialCode: '+36',  name: 'Macaristan',        flag: '🇭🇺', mask: 'XX XXX XXXX'     },
  { code: 'MK', dialCode: '+389', name: 'Kuzey Makedonya',   flag: '🇲🇰', mask: 'XX XXX XXX'      },
  { code: 'NO', dialCode: '+47',  name: 'Norveç',            flag: '🇳🇴', mask: 'XXX XX XXX'      },
  { code: 'PL', dialCode: '+48',  name: 'Polonya',           flag: '🇵🇱', mask: 'XXX XXX XXX'     },
  { code: 'PT', dialCode: '+351', name: 'Portekiz',          flag: '🇵🇹', mask: 'XXX XXX XXX'     },
  { code: 'RO', dialCode: '+40',  name: 'Romanya',           flag: '🇷🇴', mask: 'XXX XXX XXX'     },
  { code: 'RS', dialCode: '+381', name: 'Sırbistan',         flag: '🇷🇸', mask: 'XX XXX XXXX'     },
  { code: 'SK', dialCode: '+421', name: 'Slovakya',          flag: '🇸🇰', mask: 'XXX XXX XXX'     },
  { code: 'SI', dialCode: '+386', name: 'Slovenya',          flag: '🇸🇮', mask: 'XX XXX XXX'      },
  { code: 'GR', dialCode: '+30',  name: 'Yunanistan',        flag: '🇬🇷', mask: 'XXX XXX XXXX'    },
  { code: 'RU', dialCode: '+7',   name: 'Rusya',             flag: '🇷🇺', mask: 'XXX XXX XX XX'   },
  { code: 'UA', dialCode: '+380', name: 'Ukrayna',           flag: '🇺🇦', mask: 'XX XXX XXXX'     },
  { code: 'AE', dialCode: '+971', name: 'BAE',               flag: '🇦🇪', mask: 'XX XXX XXXX'     },
  { code: 'BH', dialCode: '+973', name: 'Bahreyn',           flag: '🇧🇭', mask: 'XXXX XXXX'       },
  { code: 'IQ', dialCode: '+964', name: 'Irak',              flag: '🇮🇶', mask: 'XXX XXX XXXX'    },
  { code: 'IL', dialCode: '+972', name: 'İsrail',            flag: '🇮🇱', mask: 'XX XXX XXXX'     },
  { code: 'JO', dialCode: '+962', name: 'Ürdün',             flag: '🇯🇴', mask: 'X XXXX XXXX'     },
  { code: 'KW', dialCode: '+965', name: 'Kuveyt',            flag: '🇰🇼', mask: 'XXXX XXXX'       },
  { code: 'LB', dialCode: '+961', name: 'Lübnan',            flag: '🇱🇧', mask: 'XX XXX XXX'      },
  { code: 'OM', dialCode: '+968', name: 'Umman',             flag: '🇴🇲', mask: 'XXXX XXXX'       },
  { code: 'QA', dialCode: '+974', name: 'Katar',             flag: '🇶🇦', mask: 'XXXX XXXX'       },
  { code: 'SA', dialCode: '+966', name: 'Suudi Arabistan',   flag: '🇸🇦', mask: 'XX XXX XXXX'     },
  { code: 'SY', dialCode: '+963', name: 'Suriye',            flag: '🇸🇾', mask: 'XXX XXX XXX'     },
  { code: 'YE', dialCode: '+967', name: 'Yemen',             flag: '🇾🇪', mask: 'XXX XXX XXX'     },
  { code: 'AF', dialCode: '+93',  name: 'Afganistan',        flag: '🇦🇫', mask: 'XX XXX XXXX'     },
  { code: 'AZ', dialCode: '+994', name: 'Azerbaycan',        flag: '🇦🇿', mask: 'XX XXX XX XX'    },
  { code: 'BD', dialCode: '+880', name: 'Bangladeş',         flag: '🇧🇩', mask: 'XXXX XXXXXX'     },
  { code: 'CN', dialCode: '+86',  name: 'Çin',               flag: '🇨🇳', mask: 'XXX XXXX XXXX'   },
  { code: 'GE', dialCode: '+995', name: 'Gürcistan',         flag: '🇬🇪', mask: 'XXX XXX XXX'     },
  { code: 'HK', dialCode: '+852', name: 'Hong Kong',         flag: '🇭🇰', mask: 'XXXX XXXX'       },
  { code: 'IN', dialCode: '+91',  name: 'Hindistan',         flag: '🇮🇳', mask: 'XXXXX XXXXX'     },
  { code: 'ID', dialCode: '+62',  name: 'Endonezya',         flag: '🇮🇩', mask: 'XXX XXXX XXXX'   },
  { code: 'JP', dialCode: '+81',  name: 'Japonya',           flag: '🇯🇵', mask: 'XX XXXX XXXX'    },
  { code: 'KZ', dialCode: '+7',   name: 'Kazakistan',        flag: '🇰🇿', mask: 'XXX XXX XX XX'   },
  { code: 'KR', dialCode: '+82',  name: 'Güney Kore',        flag: '🇰🇷', mask: 'XX XXXX XXXX'    },
  { code: 'MY', dialCode: '+60',  name: 'Malezya',           flag: '🇲🇾', mask: 'XX XXXX XXXX'    },
  { code: 'MN', dialCode: '+976', name: 'Moğolistan',        flag: '🇲🇳', mask: 'XXXX XXXX'       },
  { code: 'MM', dialCode: '+95',  name: 'Myanmar',           flag: '🇲🇲', mask: 'X XXX XXXX'      },
  { code: 'NP', dialCode: '+977', name: 'Nepal',             flag: '🇳🇵', mask: 'XXX XXX XXXX'    },
  { code: 'PK', dialCode: '+92',  name: 'Pakistan',          flag: '🇵🇰', mask: 'XXX XXXXXXX'     },
  { code: 'PH', dialCode: '+63',  name: 'Filipinler',        flag: '🇵🇭', mask: 'XXX XXX XXXX'    },
  { code: 'SG', dialCode: '+65',  name: 'Singapur',          flag: '🇸🇬', mask: 'XXXX XXXX'       },
  { code: 'LK', dialCode: '+94',  name: 'Sri Lanka',         flag: '🇱🇰', mask: 'XX XXX XXXX'     },
  { code: 'TW', dialCode: '+886', name: 'Tayvan',            flag: '🇹🇼', mask: 'X XXXX XXXX'     },
  { code: 'TJ', dialCode: '+992', name: 'Tacikistan',        flag: '🇹🇯', mask: 'XX XXX XXXX'     },
  { code: 'TH', dialCode: '+66',  name: 'Tayland',           flag: '🇹🇭', mask: 'XX XXX XXXX'     },
  { code: 'TM', dialCode: '+993', name: 'Türkmenistan',      flag: '🇹🇲', mask: 'XX XXXXXX'       },
  { code: 'UZ', dialCode: '+998', name: 'Özbekistan',        flag: '🇺🇿', mask: 'XX XXX XXXX'     },
  { code: 'VN', dialCode: '+84',  name: 'Vietnam',           flag: '🇻🇳', mask: 'XXX XXX XXXX'    },
  { code: 'DZ', dialCode: '+213', name: 'Cezayir',           flag: '🇩🇿', mask: 'XXX XXX XXXX'    },
  { code: 'EG', dialCode: '+20',  name: 'Mısır',             flag: '🇪🇬', mask: 'XX XXXX XXXX'    },
  { code: 'ET', dialCode: '+251', name: 'Etiyopya',          flag: '🇪🇹', mask: 'XX XXX XXXX'     },
  { code: 'GH', dialCode: '+233', name: 'Gana',              flag: '🇬🇭', mask: 'XX XXX XXXX'     },
  { code: 'KE', dialCode: '+254', name: 'Kenya',             flag: '🇰🇪', mask: 'XXX XXX XXX'     },
  { code: 'LY', dialCode: '+218', name: 'Libya',             flag: '🇱🇾', mask: 'XX XXX XXXX'     },
  { code: 'MA', dialCode: '+212', name: 'Fas',               flag: '🇲🇦', mask: 'XX XXX XXXX'     },
  { code: 'NG', dialCode: '+234', name: 'Nijerya',           flag: '🇳🇬', mask: 'XXX XXX XXXX'    },
  { code: 'SN', dialCode: '+221', name: 'Senegal',           flag: '🇸🇳', mask: 'XX XXX XXXX'     },
  { code: 'ZA', dialCode: '+27',  name: 'Güney Afrika',      flag: '🇿🇦', mask: 'XX XXX XXXX'     },
  { code: 'TN', dialCode: '+216', name: 'Tunus',             flag: '🇹🇳', mask: 'XX XXX XXX'      },
  { code: 'TZ', dialCode: '+255', name: 'Tanzanya',          flag: '🇹🇿', mask: 'XXX XXX XXX'     },
  { code: 'UG', dialCode: '+256', name: 'Uganda',            flag: '🇺🇬', mask: 'XXX XXX XXX'     },
  { code: 'US', dialCode: '+1',   name: 'ABD',               flag: '🇺🇸', mask: '(XXX) XXX-XXXX'  },
  { code: 'AR', dialCode: '+54',  name: 'Arjantin',          flag: '🇦🇷', mask: 'XX XXXX XXXX'    },
  { code: 'BO', dialCode: '+591', name: 'Bolivya',           flag: '🇧🇴', mask: 'X XXX XXXX'      },
  { code: 'BR', dialCode: '+55',  name: 'Brezilya',          flag: '🇧🇷', mask: '(XX) XXXXX-XXXX'  },
  { code: 'CA', dialCode: '+1',   name: 'Kanada',            flag: '🇨🇦', mask: '(XXX) XXX-XXXX'  },
  { code: 'CL', dialCode: '+56',  name: 'Şili',              flag: '🇨🇱', mask: 'X XXXX XXXX'     },
  { code: 'CO', dialCode: '+57',  name: 'Kolombiya',         flag: '🇨🇴', mask: 'XXX XXX XXXX'    },
  { code: 'CU', dialCode: '+53',  name: 'Küba',              flag: '🇨🇺', mask: 'X XXX XXXX'      },
  { code: 'EC', dialCode: '+593', name: 'Ekvador',           flag: '🇪🇨', mask: 'XX XXX XXXX'     },
  { code: 'MX', dialCode: '+52',  name: 'Meksika',           flag: '🇲🇽', mask: 'XX XXXX XXXX'    },
  { code: 'PE', dialCode: '+51',  name: 'Peru',              flag: '🇵🇪', mask: 'XXX XXX XXX'     },
  { code: 'UY', dialCode: '+598', name: 'Uruguay',           flag: '🇺🇾', mask: 'X XXX XXXX'      },
  { code: 'VE', dialCode: '+58',  name: 'Venezuela',         flag: '🇻🇪', mask: 'XXX XXX XXXX'    },
  { code: 'AU', dialCode: '+61',  name: 'Avustralya',        flag: '🇦🇺', mask: 'XXX XXX XXX'     },
  { code: 'NZ', dialCode: '+64',  name: 'Yeni Zelanda',      flag: '🇳🇿', mask: 'XX XXX XXXX'     },
];

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function applyMask(digits: string, mask: string): string {
  let result = '';
  let di = 0;
  for (const ch of mask) {
    if (di >= digits.length) break;
    result += ch === 'X' ? digits[di++] : ch;
  }
  return result;
}

function maskDigitCount(mask: string): number {
  return [...mask].filter(c => c === 'X').length;
}

function parseStoredValue(value: string, defaultCountry: Country) {
  if (value.startsWith('+')) {
    const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    for (const c of sorted) {
      if (value.startsWith(c.dialCode)) {
        return { country: c, national: value.slice(c.dialCode.length).replace(/\D/g, '') };
      }
    }
  }
  return { country: defaultCountry, national: value.replace(/\D/g, '') };
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export interface PhoneInputProps {
  value?:           string;
  onChange:         (value: string) => void;
  defaultDialCode?: string;
  disabled?:        boolean;
  className?:       string;
}

export function PhoneInput({
  value = '',
  onChange,
  defaultDialCode = '+90',
  disabled = false,
  className,
}: PhoneInputProps) {
  const defaultCountry = COUNTRIES.find(c => c.dialCode === defaultDialCode) ?? COUNTRIES[0]!;
  const parsed = parseStoredValue(value, defaultCountry);

  const [country,  setCountry]  = useState<Country>(parsed.country);
  const [national, setNational] = useState(() => applyMask(parsed.national, parsed.country.mask));
  const [open,     setOpen]     = useState(false);

  // Dışarıdan gelen value değişikliklerini yansıt
  useEffect(() => {
    if (!value) { setNational(''); return; }
    const p = parseStoredValue(value, defaultCountry);
    setCountry(p.country);
    setNational(applyMask(p.national, p.country.mask));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(c: Country, digits: string) {
    onChange(digits ? `${c.dialCode} ${applyMask(digits, c.mask)}` : '');
  }

  function handleCountrySelect(c: Country) {
    setCountry(c);
    setOpen(false);
    const digits = national.replace(/\D/g, '').slice(0, maskDigitCount(c.mask));
    const masked = applyMask(digits, c.mask);
    setNational(masked);
    emit(c, digits);
  }

  function handleNationalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, maskDigitCount(country.mask));
    const masked = applyMask(digits, country.mask);
    setNational(masked);
    emit(country, digits);
  }

  const maxLen      = maskDigitCount(country.mask);
  const filled      = national.replace(/\D/g, '').length;
  const placeholder = country.mask.replace(/X/g, '0');

  return (
    <div className={cn('flex h-7 rounded-md border border-input bg-input/20 dark:bg-input/30 overflow-hidden transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30', className)}>

      {/* Ülke seçici */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Ülke kodu seç"
            className="flex items-center gap-1 px-2 shrink-0 border-r border-input hover:bg-muted/60 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <span className="text-sm leading-none">{country.flag}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{country.dialCode}</span>
            <ChevronsUpDown size={10} className="text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Ülke ara…" className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty className="py-4 text-xs text-center text-muted-foreground">
                Sonuç bulunamadı
              </CommandEmpty>
              <CommandGroup>
                {COUNTRIES.map(c => (
                  <CommandItem
                    key={c.code}
                    value={`${c.name} ${c.dialCode} ${c.code}`}
                    onSelect={() => handleCountrySelect(c)}
                    className="flex items-center gap-2 text-xs cursor-pointer"
                  >
                    <span className="text-base leading-none">{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">{c.dialCode}</span>
                    <Check size={12} className={cn('ml-auto shrink-0', country.code === c.code ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Numara girişi */}
      <input
        type="tel"
        value={national}
        onChange={handleNationalChange}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLen + Math.max(0, country.mask.length - maxLen)}
        inputMode="tel"
        className="flex-1 min-w-0 bg-transparent outline-none px-2 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed md:text-xs/relaxed"
      />

      {/* Doluluk göstergesi */}
      {filled > 0 && (
        <span className={cn(
          'self-center pr-2 text-[10px] tabular-nums shrink-0 transition-colors',
          filled === maxLen ? 'text-primary' : 'text-muted-foreground',
        )}>
          {filled}/{maxLen}
        </span>
      )}
    </div>
  );
}
