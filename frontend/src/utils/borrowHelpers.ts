export interface BorrowingConflict {
  id: number;
  quantity: number;
  date_from: string;
  date_to: string | null;
  status: 'active' | 'reservation';
  user_name: string;
}

export interface ConflictWarning {
  conflict: BorrowingConflict;
  deficit: number;
  deadline: string;
}

export function findReservationConflicts(
  conflicts: BorrowingConflict[],
  totalQuantity: number,
  requestedQuantity: number
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];

  for (const c of conflicts) {
    if (c.status !== 'reservation') continue;

    const remainingAfterReservation = totalQuantity - c.quantity;
    if (requestedQuantity > remainingAfterReservation) {
      warnings.push({
        conflict: c,
        deficit: requestedQuantity - remainingAfterReservation,
        deadline: c.date_from
      });
    }
  }

  return warnings;
}
