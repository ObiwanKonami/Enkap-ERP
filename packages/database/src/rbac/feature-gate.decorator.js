"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequiresPlan = exports.FEATURE_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.FEATURE_KEY = 'required_feature';
/**
 * Endpoint'e erişim için gerekli plan özelliğini belirtir.
 *
 * Kullanım:
 *   @RequiresPlan(Feature.ML)
 *   @Post('predict')
 *
 * - starter plan bu endpoint'e erişemez.
 * - business ve enterprise erişebilir.
 * - enterprise-only özellikler için Feature.WHITE_LABEL kullan.
 */
const RequiresPlan = (feature) => (0, common_1.SetMetadata)(exports.FEATURE_KEY, feature);
exports.RequiresPlan = RequiresPlan;
