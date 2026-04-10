'use client';

import { useState, use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { crmApi } from '@/services/crm';
import { PhoneInput } from '@/components/ui/phone-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ContactType } from '@/services/crm';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Users, ArrowLeft, Save, AlertCircle,
  Building2, User, Mail, Phone, MapPin, Hash, Globe,
} from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";

const t = createTranslator(DEFAULT_LOCALE);

interface CityOption { id: number; name: string; plateCode: number; }
interface DistrictOption { name: string; }

function validateTckn(v: string): boolean {
  if (v.length !== 11 || !/^\d{11}$/.test(v) || v[0] === '0') return false;
  const d = v.split('').map(Number);
  const sum10 = (d[0]+d[2]+d[4]+d[6]+d[8])*7 - (d[1]+d[3]+d[5]+d[7]);
  if (((sum10 % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

function validateVkn(v: string): boolean {
  return /^\d{10}$/.test(v);
}

type AccountKind = 'B2B' | 'B2C';

export default function MusteriDuzenlePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const { t } = useI18n();

  const CONTACT_TYPES: { value: ContactType; label: string; desc: string }[] = [
    { value: 'customer',  label: t('crm.contactType.CUSTOMER'), desc: 'Satış yapılan firma/kişi' },
    { value: 'vendor',    label: t('crm.contactType.VENDOR'),   desc: 'Alım yapılan firma/kişi' },
    { value: 'both',      label: t('crm.contactType.BOTH'),     desc: 'Hem satış hem alım yapılan' },
    { value: 'prospect',  label: t('crm.contactType.PROSPECT'), desc: 'Henüz işlem yapılmamış lead' },
  ];
  const { id } = params;

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: () => crmApi.contacts.get(id).then(r => r.data),
  });

  const [kind,        setKind       ] = useState<AccountKind>('B2B');
  const [contactType, setContactType] = useState<ContactType>('customer');
  const [name,        setName       ] = useState('');
  const [vkn,         setVkn        ] = useState('');
  const [tckn,        setTckn       ] = useState('');
  const [email,       setEmail      ] = useState('');
  const [phone,       setPhone      ] = useState('');
  const [address,     setAddress    ] = useState('');
  const [cityId,      setCityId     ] = useState<number | null>(null);
  const [cityName,    setCityName   ] = useState('');
  const [district,    setDistrict   ] = useState('');
  const [taxOffice,   setTaxOffice  ] = useState('');
  const [mersisNo,    setMersisNo   ] = useState('');
  const [website,     setWebsite    ] = useState('');
  const [isActive,    setIsActive   ] = useState(true);
  const [formError,   setFormError  ] = useState('');

  const [cities,           setCities          ] = useState<CityOption[]>([]);
  const [districts,        setDistricts       ] = useState<DistrictOption[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  useEffect(() => {
    fetch('/api/tenant/reference/cities')
      .then(r => r.json())
      .then((list: CityOption[]) => setCities(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!cityId) { setDistricts([]); return; }
    setLoadingDistricts(true);
    fetch(`/api/tenant/reference/cities/${cityId}/districts`)
      .then(r => r.json())
      .then((list: DistrictOption[]) => setDistricts(list))
      .catch(() => setDistricts([]))
      .finally(() => setLoadingDistricts(false));
  }, [cityId]);

  const [initialized, setInitialized] = useState(false);
  if (contact && !initialized) {
    setKind(contact.vkn ? 'B2B' : contact.tckn ? 'B2C' : 'B2B');
    setContactType(contact.type);
    setName(contact.name);
    setVkn(contact.vkn   ?? '');
    setTckn(contact.tckn ?? '');
    setEmail(contact.email   ?? '');
    setPhone(contact.phone   ?? '');
    setAddress(contact.address   ?? '');
    setCityName(contact.city     ?? '');
    setDistrict(contact.district ?? '');
    setTaxOffice(contact.taxOffice ?? '');
    setMersisNo(contact.mersisNo   ?? '');
    setIsActive(contact.isActive);
    setInitialized(true);
  }

  // Once cities are loaded, resolve the saved city name back to an id
  useEffect(() => {
    if (cities.length > 0 && cityName && !cityId) {
      const match = cities.find(c => c.name === cityName);
      if (match) setCityId(match.id);
    }
  }, [cities, cityName]);

  const tcknValid = tckn === '' || validateTckn(tckn);
  const vknValid  = vkn  === '' || validateVkn(vkn);

  const canSubmit = name.trim().length >= 2 &&
    (kind === 'B2B' ? (vkn === '' || vknValid) : (tckn === '' || tcknValid));

  const { mutate, isPending } = useMutation({
    mutationFn: () => crmApi.contacts.update(id, {
      name:    name.trim(),
      type:    contactType,
      email:   email   || undefined,
      phone:   phone   || undefined,
      vkn:       kind === 'B2B' && vkn  ? vkn  : undefined,
      tckn:      kind === 'B2C' && tckn ? tckn : undefined,
      address:   address   || undefined,
      city:      cityName  || undefined,
      district:  district  || undefined,
      taxOffice: kind === 'B2B' && taxOffice ? taxOffice : undefined,
      mersisNo:  kind === 'B2B' && mersisNo  ? mersisNo  : undefined,
      isActive,
    }),
    onSuccess: () => {
      toast.success(t('common.success'));
      router.push(`/musteri/${id}`);
    },
    onError: () => {
      setFormError(t('common.error'));
      toast.error(t('common.error'));
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] gap-2.5 text-muted-foreground text-sm">
        <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin"/>
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="max-w-[780px] mx-auto px-1">

      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/musteri/${id}`}>
            <ArrowLeft size={16}/>
          </Link>
        </Button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center">
            <Users size={15} className="text-muted-foreground"/>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t('common.edit')}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {contact?.name ?? t('common.update')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">

        <Card className="p-4">
          <Label className="text-xs text-muted-foreground mb-2.5 block">{t('crm.contact')}</Label>
          <div className="flex gap-2">
            {([
              { v: 'B2B' as AccountKind, icon: <Building2 size={14}/>, label: 'Kurumsal (B2B)', sub: `${t('crm.company')} — VKN ile` },
              { v: 'B2C' as AccountKind, icon: <User size={14}/>,      label: 'Bireysel (B2C)',  sub: `${t('crm.contact')} — TCKN ile` },
            ] as const).map(({ v, icon, label, sub }) => {
              const active = kind === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setKind(v)}
                  className={`flex-1 flex items-center gap-2.5 p-3 rounded-lg cursor-pointer transition-all text-left border ${
                    active ? 'bg-primary/10 border-primary/30' : 'bg-transparent border-border'
                  }`}
                >
                  <span className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
                  <div>
                    <div className={`text-xs font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {label}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <Label className="text-xs text-muted-foreground mb-2.5 block">{t('common.type')}</Label>
          <div className="flex flex-wrap gap-2">
            {CONTACT_TYPES.map(item => {
              const active = contactType === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setContactType(item.value)}
                  className={`px-3 py-1.5 rounded-md cursor-pointer transition-all border ${
                    active ? 'bg-muted border-border' : 'bg-transparent border-border'
                  }`}
                >
                  <div className={`text-xs font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{item.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            {kind === 'B2B' ? <Building2 size={14} className="text-muted-foreground"/> : <User size={14} className="text-muted-foreground"/>}
            <span className="text-sm font-semibold text-foreground">
              {kind === 'B2B' ? t('crm.company') : t('crm.contact')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">

            <div className="sm:col-span-2">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                {kind === 'B2B' ? t('crm.company') : t('hr.fullName')} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={kind === 'B2B' ? 'Örn: Enkap Yazılım A.Ş.' : 'Örn: Ahmet Yılmaz'}
                autoFocus
              />
              {name.length > 0 && name.trim().length < 2 && (
                <p className="text-[11px] text-destructive mt-1">En az 2 karakter giriniz.</p>
              )}
            </div>

            {kind === 'B2B' ? (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                  <Hash size={11}/>Vergi Kimlik No (VKN)
                </Label>
                <Input
                  className={vkn && !vknValid ? 'border-destructive' : ''}
                  value={vkn}
                  onChange={e => setVkn(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10 hane rakam"
                  maxLength={10}
                />
                {vkn && !vknValid && (
                  <p className="text-[11px] text-destructive mt-1">VKN 10 hane olmalıdır.</p>
                )}
                {vkn.length === 10 && vknValid && (
                  <p className="text-[11px] text-primary mt-1">✓ Geçerli VKN</p>
                )}
              </div>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                  <Hash size={11}/>TC Kimlik No (TCKN)
                </Label>
                <Input
                  className={tckn && !tcknValid ? 'border-destructive' : ''}
                  value={tckn}
                  onChange={e => setTckn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="11 hane rakam"
                  maxLength={11}
                />
                {tckn.length === 11 && !tcknValid && (
                  <p className="text-[11px] text-destructive mt-1">Geçersiz TCKN.</p>
                )}
                {tckn.length === 11 && tcknValid && (
                  <p className="text-[11px] text-primary mt-1">✓ Geçerli TCKN</p>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Mail size={11}/>E-posta
              </Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ornek@sirket.com"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Phone size={11}/>Telefon
              </Label>
              <PhoneInput
                value={phone}
                onChange={setPhone}
              />
            </div>

            {kind === 'B2B' && (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                    <Globe size={11}/>Web Sitesi
                  </Label>
                  <Input
                    type="url"
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    placeholder="https://www.sirket.com.tr"
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Vergi Dairesi</Label>
                  <Input
                    value={taxOffice}
                    onChange={e => setTaxOffice(e.target.value)}
                    placeholder="Örn: Kadıköy"
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">MERSİS No</Label>
                  <Input
                    value={mersisNo}
                    onChange={e => setMersisNo(e.target.value.replace(/\D/g, '').slice(0, 16))}
                    placeholder="16 hane rakam"
                    maxLength={16}
                  />
                </div>
              </>
            )}

          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={14} className="text-muted-foreground"/>
            <span className="text-sm font-semibold text-foreground">{t('hr.address')}</span>
          </div>
          <div className="flex flex-col gap-3.5">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">{t('hr.address')}</Label>
              <textarea
                className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y font-inherit"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Mahalle, Cadde, No, Daire"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">{t('crm.city')}</Label>
                <Select
                  value={cityId ? String(cityId) : ''}
                  onValueChange={(val) => {
                    const id = Number(val);
                    const city = cities.find(c => c.id === id);
                    setCityId(id);
                    setCityName(city?.name ?? '');
                    setDistrict('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="İl seçiniz" />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">İlçe</Label>
                <Select
                  value={district}
                  onValueChange={setDistrict}
                  disabled={!cityId || loadingDistricts}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingDistricts ? 'Yükleniyor...' : 'İlçe seçiniz'} />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map(d => (
                      <SelectItem key={d.name} value={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                {isActive ? t('common.active') : t('common.passive')}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t('common.status')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isActive ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                isActive ? 'translate-x-6' : 'translate-x-1'
              }`}/>
            </button>
          </div>
        </Card>

        {formError && (
          <Alert variant="destructive">
            <AlertCircle size={14} />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2.5 justify-end pb-6">
          <Button variant="outline" asChild>
            <Link href={`/musteri/${id}`}>
              {t('common.cancel')}
            </Link>
          </Button>
          <Button
            onClick={() => { if (canSubmit && !isPending) mutate(); }}
            disabled={isPending || !canSubmit}
            isLoading={isPending}
          >
            <Save size={14}/>
            {t('common.save')}
          </Button>
        </div>

      </div>
    </div>
  );
}
