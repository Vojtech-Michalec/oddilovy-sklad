/**
 * borrowHelpers.ts - čistá business logika kolem půjčování.
 *
 * Smyslem je vytáhnout logiku z React komponent, aby šly snadno testovat
 * a aby JSX zůstal hezky čitelný.
 */

export interface BorrowingConflict {
  id: number;
  quantity: number;
  date_from: string;
  date_to: string | null;
  status: 'active' | 'reservation';
  user_name: string;
}

export interface ConflictWarning {
  /** Konflikt, který warning způsobil. */
  conflict: BorrowingConflict;
  /** Kolik kusů bude muset uživatel vrátit a do kdy. */
  deficit: number;
  deadline: string;
}

/**
 * Spočítá, které budoucí REZERVACE jsou v kolizi s aktuálně požadovaným
 * množstvím. Používá se pro dvojité potvrzení při okamžité výpůjčce.
 *
 * Pravidlo: pokud chci vzít N kusů a v budoucnu má někdo zarezervováno
 * tolik kusů, že po jejich odečtení od celku nezůstane N na skladu,
 * je to konflikt - musím něco vrátit do data té rezervace.
 */
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
