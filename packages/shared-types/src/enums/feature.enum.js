"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_FEATURES = exports.Feature = void 0;
/**
 * Plan bazlı özellik kapıları.
 *
 * Her özellik belirli bir minimum plana bağlıdır.
 * @RequiresPlan(Feature.ML) → business veya enterprise gerektirir.
 */
var Feature;
(function (Feature) {
    /** Yapay zeka tahminleme (XGBoost, Prophet, anomali) — Business+ */
    Feature["ML"] = "ml";
    /** Trendyol, Hepsiburada marketplace entegrasyonu — Business+ */
    Feature["MARKETPLACE"] = "marketplace";
    /** İK ve bordro modülü (HR, Payroll) — Business+ */
    Feature["HR"] = "hr";
    /** CRM: kişi, fırsat, aktivite — Business+ */
    Feature["CRM"] = "crm";
    /** White label ve özel domain — Enterprise */
    Feature["WHITE_LABEL"] = "white_label";
})(Feature || (exports.Feature = Feature = {}));
/** Hangi plan hangi özelliklere sahip */
exports.PLAN_FEATURES = {
    starter: [Feature.HR, Feature.CRM],
    business: [Feature.ML, Feature.MARKETPLACE, Feature.HR, Feature.CRM],
    enterprise: [
        Feature.ML,
        Feature.MARKETPLACE,
        Feature.HR,
        Feature.CRM,
        Feature.WHITE_LABEL,
    ],
};
