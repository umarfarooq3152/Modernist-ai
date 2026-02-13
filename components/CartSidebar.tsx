
import React from 'react';
import { X, Minus, Plus, ShoppingBag, ArrowRight, Tag, Sparkles, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';

const CartSidebar: React.FC = () => {
  const { cart, isCartOpen, toggleCart, removeFromCart, updateQuantity, cartSubtotal, cartTotal, negotiatedDiscount, appliedCoupon, synergyDiscount } = useStore();
  const navigate = useNavigate();

  if (!isCartOpen) return null;

  const handleCheckout = () => {
    toggleCart();
    navigate('/checkout');
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 dark:bg-white/20 z-50 transition-opacity backdrop-blur-sm" onClick={toggleCart} />
      
      <div className="fixed top-0 right-0 h-full w-full sm:w-[450px] bg-white dark:bg-black z-[60] shadow-2xl flex flex-col border-l border-black dark:border-white animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-6 border-b border-black dark:border-white">
          <div className="flex items-center space-x-3">
            <ShoppingBag size={20} />
            <h2 className="text-lg font-serif-elegant font-bold uppercase tracking-widest">Cart</h2>
          </div>
          <button onClick={toggleCart} className="p-2 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-6">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
              <ShoppingBag size={48} strokeWidth={0.5} className="text-gray-300 dark:text-gray-700" />
              <p className="text-sm uppercase tracking-widest text-gray-500 dark:text-gray-400">Your cart is empty</p>
              <button onClick={toggleCart} className="text-xs uppercase tracking-widest font-bold underline underline-offset-4">Start Shopping</button>
            </div>
          ) : (
            <div className="space-y-8">
              {cart.map((item) => (
                <div key={item.product.id} className="flex space-x-4 group relative">
                  <div className="w-24 aspect-[3/4] flex-shrink-0 bg-gray-50 dark:bg-gray-900 overflow-hidden border border-black/5 dark:border-white/5">
                    <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <h3 className="text-xs font-bold uppercase tracking-widest pr-4">{item.product.name}</h3>
                        <button onClick={() => removeFromCart(item.product.id)} className="text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white"><X size={16} /></button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest">{item.product.category}</p>
                        {item.quantity >= 2 && (
                          <span className="text-[8px] text-black dark:text-black bg-yellow-400 px-1 py-0.5 font-black uppercase">Volume Protocol Actuated</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center border border-black dark:border-white">
                        <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-900"><Minus size={12} /></button>
                        <span className="px-4 text-xs font-bold">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-900"><Plus size={12} /></button>
                      </div>
                      <div className="text-right">
                        {item.quantity >= 2 && (
                          <span className="block text-[8px] line-through text-gray-300 dark:text-gray-600 decoration-black/20 dark:decoration-white/20 decoration-2">${(item.product.price * item.quantity).toLocaleString()}</span>
                        )}
                        <span className="text-sm font-bold">${(item.product.price * item.quantity).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-8 border-t border-black dark:border-white bg-white dark:bg-black">
            <div className="space-y-4 mb-8">
              <div className="flex justify-between text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
                <span>Subtotal</span>
                <span>${cartSubtotal.toLocaleString()}</span>
              </div>
              
              {synergyDiscount > 0 && (
                <div className="flex justify-between text-xs uppercase tracking-widest text-black dark:text-white font-black bg-gray-50 dark:bg-gray-900 px-2 py-2 border-l-4 border-black dark:border-white animate-in fade-in slide-in-from-left duration-700">
                  <span className="flex items-center gap-2">
                    <Sparkles size={14} className="animate-pulse" />
                    Archival Synergy Concession
                  </span>
                  <span>-${synergyDiscount.toLocaleString()}</span>
                </div>
              )}

              {negotiatedDiscount > 0 && (
                <div className="flex justify-between text-xs uppercase tracking-widest text-green-600 font-bold">
                  <span className="flex items-center gap-1"><Tag size={12} /> Discount ({appliedCoupon})</span>
                  <span>-{negotiatedDiscount}%</span>
                </div>
              )}

              <div className="flex justify-between text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
                <span>Shipping Synergy</span>
                <span>Complimentary</span>
              </div>
              <div className="flex justify-between items-end border-t border-black/10 dark:border-white/10 pt-4 mt-4">
                <span className="text-sm font-bold uppercase tracking-widest">Total Acquisition</span>
                <span className="text-xl font-bold">${cartTotal.toLocaleString()}</span>
              </div>
            </div>
            
            <button 
              onClick={handleCheckout}
              className="w-full bg-black dark:bg-white text-white dark:text-black py-5 text-xs uppercase tracking-[0.2em] font-bold flex items-center justify-center space-x-3 hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white border border-black dark:border-white transition-all group"
            >
              <span>Finalize Acquisition</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default CartSidebar;
