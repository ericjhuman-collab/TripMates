export interface Category {
  id: string;
  name: string;
  icon: string;
}

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'restaurant', name: 'Restaurant', icon: '🍽️' },
  { id: 'groceries', name: 'Groceries', icon: '🛒' },
  { id: 'drinks', name: 'Drinks / Bar', icon: '🍻' },
  { id: 'accommodation', name: 'Accommodation', icon: '🛏️' },
  { id: 'transport', name: 'Transportation', icon: '🚆' },
  { id: 'activities', name: 'Activities', icon: '🎟️' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️' },
  { id: 'other', name: 'Other', icon: '💰' },
];

export const getCategoryById = (id: string): Category | undefined => {
  return EXPENSE_CATEGORIES.find(c => c.id === id);
};
