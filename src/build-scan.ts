import * as core from '@actions/core'
import {
    getBuildScanPublishEnabled,
    getBuildScanTermsOfServiceUrl,
    getBuildScanTermsOfServiceAgree
} from './input-params'

export function setup(): void {
    if (getBuildScanPublishEnabled() && verifyTermsOfServiceAgreement()) {
        maybeExportVariable('DEVELOCITY_INJECTION_ENABLED', 'true')
        maybeExportVariable('DEVELOCITY_PLUGIN_VERSION', '3.16.1')
        maybeExportVariable('DEVELOCITY_CCUD_PLUGIN_VERSION', '1.12.1')
        maybeExportVariable('BUILD_SCAN_TERMS_OF_SERVICE_URL', getBuildScanTermsOfServiceUrl())
        maybeExportVariable('BUILD_SCAN_TERMS_OF_SERVICE_AGREE', getBuildScanTermsOfServiceAgree())
    }
}

function verifyTermsOfServiceAgreement(): boolean {
    if (
        getBuildScanTermsOfServiceUrl() !== 'https://gradle.com/terms-of-service' ||
        getBuildScanTermsOfServiceAgree() !== 'yes'
    ) {
        core.warning(`Terms of service must be agreed in order to publish build scans.`)
        return false
    }
    return true
}

function maybeExportVariable(variableName: string, value: unknown): void {
    if (!process.env[variableName]) {
        core.exportVariable(variableName, value)
    }
}
