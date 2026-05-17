import 'server-only'

export interface SubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

// Stubs replaced in Task 10 with real web-push wiring.
export async function sendFreedSlotPush(
  _sub: SubscriptionRow,
  _date: string,
  _hour: number,
): Promise<void> {
  // intentionally empty — Task 10 wires web-push
}

export async function sendReminderPush(
  _sub: SubscriptionRow,
  _bookingId: string,
  _date: string,
  _hour: number,
): Promise<void> {
  // intentionally empty — Task 10 wires web-push
}
