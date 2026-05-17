export type RuleCode =
  // validation (assertBookable, watchSlot)
  | 'OUT_OF_HOURS'
  | 'PAST_SLOT'
  | 'HORIZON_EXCEEDED'
  | 'MAX_3H_PER_DAY'
  | 'OWN_APARTMENT'
  // booking transaction
  | 'SLOT_TAKEN'
  | 'NOT_FOUND_OR_NOT_YOURS'
  // auth
  | 'INVALID_PASSCODE'
  | 'INVALID_APARTMENT'

export class RuleError extends Error {
  constructor(public code: RuleCode, message?: string) {
    super(message ?? code)
    this.name = 'RuleError'
  }
}

export const DANISH_MESSAGES: Record<RuleCode, string> = {
  SLOT_TAKEN: 'Tiden er lige blevet booket. Prøv en anden.',
  MAX_3H_PER_DAY: 'Du har allerede booket 3 timer i dag. Annullér en eksisterende booking først.',
  PAST_SLOT: 'Du kan ikke booke i fortiden.',
  HORIZON_EXCEEDED: 'Du kan kun booke op til 14 dage frem.',
  OUT_OF_HOURS: 'Vasketider er kun mellem 07:00 og 22:00.',
  NOT_FOUND_OR_NOT_YOURS: 'Bookingen findes ikke eller tilhører ikke din lejlighed.',
  OWN_APARTMENT: 'Du kan ikke vagte din egen booking.',
  INVALID_PASSCODE: 'Forkert kode.',
  INVALID_APARTMENT: 'Ugyldig lejlighed.',
}
