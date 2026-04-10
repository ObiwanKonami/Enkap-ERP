"""
Mizan ve bilanço raporlarını Türkçe özetleyen araç.

Finansal raporları analiz ederek yönetim kuruluna sunulabilecek
kısa ve net Türkçe özet üretir.
"""

import logging

logger = logging.getLogger(__name__)


class ReportSummarizerTool:
    """
    Finansal rapor özetleme aracı.

    Mizan ve bilanço verilerini Türkçe yönetici özetine dönüştürür.
    TDHP hesap kodlarını ve Türkiye muhasebe standartlarını göz önünde bulundurur.
    """

    def __init__(self, openai_client: "OpenAIClient") -> None:  # type: ignore[name-defined]
        from ..llm.prompt_templates import RAPOR_OZET_PROMPTU

        self._client = openai_client
        self._system_prompt = RAPOR_OZET_PROMPTU

    async def summarize_mizan(
        self,
        mizan_data: dict,
        period: str,
        tenant_id: str,
    ) -> str:
        """
        Mizan verilerini analiz eder ve Türkçe yönetici özeti üretir.

        Parametreler:
            mizan_data : Hesap kodları ve bakiyelerini içeren sözlük
                         {"accounts": [{"code": "100", "name": "Kasa", "debit": 50000, "credit": 0}]}
            period     : Dönem bilgisi (örn. "Mart 2026" veya "01.01.2026-31.03.2026")
            tenant_id  : Log takibi için tenant kimliği

        Döner:
            Türkçe mizan özeti (maks 200 kelime)
        """
        logger.info(
            "Mizan özeti oluşturuluyor — tenant_id=%s dönem=%s", tenant_id, period
        )

        # Özet istatistikler hesapla
        accounts = mizan_data.get("accounts", [])
        total_debit = sum(a.get("debit", 0) for a in accounts)
        total_credit = sum(a.get("credit", 0) for a in accounts)
        account_count = len(accounts)

        # Önemli hesapları bul (büyük bakiyeli ilk 10)
        top_accounts = sorted(
            accounts,
            key=lambda a: abs(a.get("debit", 0) - a.get("credit", 0)),
            reverse=True,
        )[:10]

        top_accounts_text = "\n".join([
            f"  {a.get('code', '?')} {a.get('name', '?')}: "
            f"Borç {a.get('debit', 0):,} kr, "
            f"Alacak {a.get('credit', 0):,} kr"
            for a in top_accounts
        ])

        user_message = (
            f"Dönem: {period}\n"
            f"Toplam hesap sayısı: {account_count}\n"
            f"Toplam borç: {total_debit:,} kuruş\n"
            f"Toplam alacak: {total_credit:,} kuruş\n"
            f"Denge farkı: {abs(total_debit - total_credit):,} kuruş\n\n"
            f"En yüksek bakiyeli hesaplar:\n{top_accounts_text}\n\n"
            "Bu mizanı Türkçe olarak özetle. "
            "Kritik bulgular ve dikkat edilmesi gereken noktaları belirt."
        )

        summary = await self._client.chat_completion(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=self._system_prompt,
            tenant_id=tenant_id,
            temperature=0.2,
        )

        logger.debug(
            "Mizan özeti tamamlandı — tenant_id=%s dönem=%s", tenant_id, period
        )

        return summary

    async def summarize_bilanco(
        self,
        bilanco_data: dict,
        period: str,
        tenant_id: str,
        previous_period_data: dict | None = None,
    ) -> str:
        """
        Bilanço verilerini analiz eder ve Türkçe yönetici özeti üretir.

        Likidite, kaldıraç ve karlılık oranlarını hesaplayarak yorumlar.

        Parametreler:
            bilanco_data         : Aktif/Pasif kalemlerini içeren sözlük
            period               : Dönem bilgisi
            tenant_id            : Log takibi için tenant kimliği
            previous_period_data : Karşılaştırma için önceki dönem (opsiyonel)
        """
        logger.info(
            "Bilanço özeti oluşturuluyor — tenant_id=%s dönem=%s", tenant_id, period
        )

        # Temel bilanço kalemleri
        current_assets = bilanco_data.get("current_assets", 0)       # Dönen varlıklar
        non_current_assets = bilanco_data.get("non_current_assets", 0) # Duran varlıklar
        total_assets = bilanco_data.get("total_assets", current_assets + non_current_assets)

        current_liabilities = bilanco_data.get("current_liabilities", 0)   # KVYK
        non_current_liabilities = bilanco_data.get("non_current_liabilities", 0)  # UVYK
        equity = bilanco_data.get("equity", 0)                             # Öz kaynaklar
        total_liabilities = bilanco_data.get(
            "total_liabilities", current_liabilities + non_current_liabilities
        )

        # Finansal oranlar
        current_ratio = (
            round(current_assets / current_liabilities, 2) if current_liabilities > 0 else None
        )
        debt_to_equity = (
            round(total_liabilities / equity, 2) if equity > 0 else None
        )

        comparison_text = ""
        if previous_period_data:
            prev_assets = previous_period_data.get("total_assets", 0)
            if prev_assets > 0:
                asset_change_pct = round(
                    (total_assets - prev_assets) / prev_assets * 100, 1
                )
                comparison_text = (
                    f"\nÖnceki dönem toplam aktif: {prev_assets:,} kuruş "
                    f"(Değişim: %{asset_change_pct:+.1f})"
                )

        user_message = (
            f"Dönem: {period}\n\n"
            f"AKTİF:\n"
            f"  Dönen Varlıklar: {current_assets:,} kuruş\n"
            f"  Duran Varlıklar: {non_current_assets:,} kuruş\n"
            f"  Toplam Aktif: {total_assets:,} kuruş\n\n"
            f"PASİF:\n"
            f"  Kısa Vadeli Yabancı Kaynaklar: {current_liabilities:,} kuruş\n"
            f"  Uzun Vadeli Yabancı Kaynaklar: {non_current_liabilities:,} kuruş\n"
            f"  Öz Kaynaklar: {equity:,} kuruş\n"
            f"  Toplam Pasif: {total_liabilities + equity:,} kuruş\n\n"
            f"ORANLAR:\n"
            f"  Cari Oran: {current_ratio if current_ratio is not None else 'hesaplanamadı'}\n"
            f"  Borç/Öz Kaynak: {debt_to_equity if debt_to_equity is not None else 'hesaplanamadı'}\n"
            f"{comparison_text}\n\n"
            "Bu bilançoyu Türkçe olarak özetle. "
            "Likidite durumu, kaldıraç ve önemli değişimleri yorumla."
        )

        summary = await self._client.chat_completion(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=self._system_prompt,
            tenant_id=tenant_id,
            temperature=0.2,
        )

        logger.debug(
            "Bilanço özeti tamamlandı — tenant_id=%s dönem=%s", tenant_id, period
        )

        return summary
