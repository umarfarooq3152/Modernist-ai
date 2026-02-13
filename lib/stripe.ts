
export const STRIPE_PUBLIC_KEY = 'pk_test_51T0JatPgX2QsMZYBxlY2EkKhIt4y7AB8oHrVKKNh6ZWImXi0IwogVhv6BdmeR8zejYlO4QPLC4mqylwfAb24qvR400iPBlZHJN';

export const getStripe = () => {
  // @ts-ignore - Stripe is loaded via CDN in index.html
  return window.Stripe(STRIPE_PUBLIC_KEY);
};