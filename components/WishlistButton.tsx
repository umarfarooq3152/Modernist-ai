import React, { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { wishlistApi } from '../lib/ragApi';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';

interface WishlistButtonProps {
  productId: string;
  className?: string;
  size?: number;
}

const WishlistButton: React.FC<WishlistButtonProps> = ({ productId, className = '', size = 16 }) => {
  const { user } = useAuth();
  const { addToast } = useStore();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load wishlist state for this product on mount
  useEffect(() => {
    if (!user) return;
    wishlistApi.getAll()
      .then(ids => setSaved(ids.includes(productId)))
      .catch(() => {});
  }, [user, productId]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      addToast('Sign in to save pieces to your wishlist', 'info');
      return;
    }

    setLoading(true);
    try {
      const next = await wishlistApi.toggle(productId, saved);
      setSaved(next);
      addToast(next ? 'Saved to wishlist' : 'Removed from wishlist', 'success');
    } catch {
      addToast('Could not update wishlist', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      className={`flex items-center justify-center transition-all ${className} ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'}`}
    >
      <Heart
        size={size}
        strokeWidth={1}
        fill={saved ? 'black' : 'none'}
        className={saved ? 'text-black' : 'text-current'}
      />
    </button>
  );
};

export default WishlistButton;
