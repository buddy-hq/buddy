const COPYRIGHT_PREFIX = "Copyright \u00A9"

export type BuddyBranding = {
  appProtocol: string
  copyrightHolder: string
  copyrightStartYear: number
  desktopPackageDescription: string
  productName: string
}

export const BUDDY_BRANDING = {
  appProtocol: "buddy",
  copyrightHolder: "Prashant Bhudwal",
  copyrightStartYear: 2026,
  desktopPackageDescription: "Buddy Electron desktop shell",
  productName: "Buddy",
} satisfies BuddyBranding

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

export function formatCopyrightYears(currentYear: number = new Date().getFullYear()): string {
  assertPositiveInteger(currentYear, "Current year")

  if (currentYear <= BUDDY_BRANDING.copyrightStartYear) {
    return String(BUDDY_BRANDING.copyrightStartYear)
  }

  return `${BUDDY_BRANDING.copyrightStartYear}-${currentYear}`
}

export function formatCopyrightLabel(currentYear: number = new Date().getFullYear()): string {
  return `${formatCopyrightYears(currentYear)} ${BUDDY_BRANDING.copyrightHolder}`
}

export function formatCopyrightNotice(currentYear: number = new Date().getFullYear()): string {
  return `${COPYRIGHT_PREFIX} ${formatCopyrightLabel(currentYear)}`
}
