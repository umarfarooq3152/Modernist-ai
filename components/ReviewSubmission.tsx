import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';

interface ReviewSubmissionProps {
  productId: string;
  productName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ReviewSubmission: React.FC<ReviewSubmissionProps> = ({ productId, productName, onClose, onSuccess }) => {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { submitReview } = useStore();
  const { user, profile } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      return;
    }

    if (rating === 0) {
      return;
    }

    if (reviewText.trim().length < 10) {
      return;
    }

    setIsSubmitting(true);
    
    const userName = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous Patron';
    
    const success = await submitReview(productId, rating, reviewText.trim(), user.id, userName);
    
    setIsSubmitting(false);
    
    if (success) {
      onSuccess();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-md" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-2xl bg-white dark:bg-black border border-black dark:border-white shadow-2xl animate-in zoom-in-95 duration-300">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-10 p-3 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all active:scale-90"
        >
          <X size={20} strokeWidth={1} />
        </button>

        <div className="p-8 md:p-12 space-y-8">
          <div className="space-y-2">
            <h2 className="font-serif-elegant text-3xl md:text-4xl font-bold uppercase tracking-tight">
              Document Experience
            </h2>
            <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 dark:text-gray-500 font-black">
              {productName}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Star Rating */}
            <div className="space-y-4">
              <label className="text-[10px] uppercase tracking-[0.3em] font-black text-gray-600 dark:text-gray-400">
                Resonance Level *
              </label>
              <div className="flex items-center gap-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="transition-all hover:scale-125 active:scale-110"
                  >
                    <Star
                      size={32}
                      fill={star <= (hoveredRating || rating) ? "black" : "none"}
                      strokeWidth={1}
                      className={`transition-colors ${
                        star <= (hoveredRating || rating) 
                          ? "text-black dark:text-white" 
                          : "text-gray-300 dark:text-gray-700"
                      }`}
                    />
                  </button>
                ))}
                {rating > 0 && (
                  <span className="ml-4 text-sm font-black">
                    {rating}.0 / 5.0
                  </span>
                )}
              </div>
            </div>

            {/* Review Text */}
            <div className="space-y-4">
              <label className="text-[10px] uppercase tracking-[0.3em] font-black text-gray-600 dark:text-gray-400">
                Archival Testimonial *
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share your documented experience with this silhouette..."
                rows={6}
                className="w-full bg-transparent border border-black/10 dark:border-white/10 p-4 text-sm font-clerk focus:border-black dark:focus:border-white outline-none transition-colors resize-none"
                minLength={10}
                required
              />
              <p className="text-[9px] uppercase tracking-wider text-gray-400 dark:text-gray-600 font-black">
                Minimum 10 characters • {reviewText.length} / 500
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-black/10 dark:border-white/10 py-5 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all active:scale-95"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || rating === 0 || reviewText.trim().length < 10}
                className="flex-1 bg-black dark:bg-white text-white dark:text-black py-5 text-[10px] uppercase tracking-[0.4em] font-black hover:opacity-80 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Syncing...' : 'Submit Testimonial'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ReviewSubmission;
