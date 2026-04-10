import type { Feature } from '@enkap/shared-types';
export declare const FEATURE_KEY = "required_feature";
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
export declare const RequiresPlan: (feature: Feature) => import("node_modules/@nestjs/common").CustomDecorator<string>;
