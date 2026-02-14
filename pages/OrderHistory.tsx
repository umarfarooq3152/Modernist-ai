
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Clock, CheckCircle, ChevronRight, ShoppingBag, PartyPopper } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { getPaymentStatus } from '../lib/stripe';

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url: string;
}

interface Order {
  id: string;
  date: string;
  total: number;
  status: 'Delivered' | 'Processing' | 'Shipped';
  items: OrderItem[];
}

const mockOrders: Order[] = [
  {
    id: "ORD-9283-X",
    date: "January 14, 2024",
    total: 945,
    status: 'Delivered',
    items: [
      { id: "1", name: "Standard Wool Overcoat", price: 850, quantity: 1, image_url: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800&auto=format&fit=crop" },
      { id: "2", name: "Heavyweight Boxy Tee", price: 95, quantity: 1, image_url: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop" }
    ]
  },
  {
    id: "ORD-8112-L",
    date: "December 02, 2023",
    total: 320,
    status: 'Delivered',
    items: [
      { id: "4", name: "Ceramic Sculpture Vase", price: 320, quantity: 1, image_url: "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?q=80&w=800&auto=format&fit=crop" }
    ]
  },
  {
    id: "ORD-7550-M",
    date: "November 18, 2023",
    total: 450,
    status: 'Delivered',
    items: [
      { id: "5", name: "Pleated Tapered Trousers", price: 450, quantity: 1, image_url: "https://images.unsplash.com/photo-1624373687551-577ed21889ee?q=80&w=800&auto=format&fit=crop" }
    ]
  }
];

const OrderHistory: React.FC = () => {
  const { user, loading } = useAuth();
  const { addToast, clearCart } = useStore();
  const navigate = useNavigate();
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Handle Stripe payment redirect result
  useEffect(() => {
    const status = getPaymentStatus();
    if (status === 'success') {
      setPaymentSuccess(true);
      clearCart();
      addToast('Payment confirmed! Your acquisition is being processed.', 'success');
    }
  }, [addToast, clearCart]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700">
        <h2 className="text-2xl font-serif-elegant mb-4 uppercase tracking-widest text-black">Identity Required</h2>
        <p className="text-gray-500 text-sm mb-8 uppercase tracking-widest">You must be authenticated to access the acquisition history.</p>
        <Link to="/" className="border border-black px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all">
          Return to Archive
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-12 animate-in fade-in duration-700">
      <button
        onClick={() => navigate('/')}
        className="flex items-center space-x-2 text-xs uppercase tracking-widest font-bold mb-12 hover:opacity-50 transition-opacity"
      >
        <ArrowLeft size={16} />
        <span>Return to Archive</span>
      </button>

      {/* Stripe Payment Success Banner */}
      {paymentSuccess && (
        <div className="mb-12 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-8 text-center animate-in fade-in slide-in-from-top duration-700">
          <CheckCircle size={40} strokeWidth={1} className="mx-auto text-green-600 dark:text-green-400 mb-4" />
          <h2 className="font-serif-elegant text-2xl md:text-3xl font-bold uppercase tracking-tight mb-2 text-green-700 dark:text-green-300">
            Payment Confirmed
          </h2>
          <p className="text-[10px] uppercase tracking-[0.3em] text-green-600 dark:text-green-400 font-bold max-w-md mx-auto">
            Your Stripe payment was processed successfully. Your acquisition is now being prepared for dispatch.
          </p>
        </div>
      )}

      <div className="mb-20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 font-bold mb-4">Patron History</p>
        <h1 className="font-serif-elegant text-5xl md:text-7xl font-bold uppercase tracking-tighter leading-none mb-4">
          Acquisitions
        </h1>
        <p className="text-xs uppercase tracking-[0.2em] text-gray-500 max-w-lg">
          A documented chronicle of your selections from the MODERNIST archive. Each piece represents a permanent addition to your silhouette.
        </p>
      </div>

      <div className="space-y-12">
        {mockOrders.length > 0 ? (
          mockOrders.map((order) => (
            <div key={order.id} className="group border-t border-black pt-12 animate-in slide-in-from-bottom-4 duration-700">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8 mb-10">
                <div className="space-y-2">
                  <div className="flex items-center space-x-4">
                    <span className="text-xs font-bold uppercase tracking-[0.2em]">{order.id}</span>
                    <span className="flex items-center space-x-2 px-3 py-1 bg-gray-50 border border-black/5 rounded-full">
                      {order.status === 'Delivered' ? <CheckCircle size={10} /> : <Clock size={10} />}
                      <span className="text-[8px] uppercase tracking-widest font-black italic">{order.status}</span>
                    </span>
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-400 font-medium italic">{order.date}</p>
                </div>

                <div className="flex flex-col items-start lg:items-end">
                  <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Total Acquisition</span>
                  <span className="text-2xl font-bold">${order.total.toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {order.items.map((item) => (
                  <div key={item.id} className="flex space-x-4 border border-black/5 p-4 hover:border-black transition-colors">
                    <div className="w-16 aspect-[3/4] bg-gray-50 border border-black/5 overflow-hidden flex-shrink-0">
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700" />
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <h4 className="text-[9px] font-bold uppercase tracking-widest leading-tight">{item.name}</h4>
                        <p className="text-[8px] text-gray-400 uppercase tracking-widest mt-1">Quantity: {item.quantity}</p>
                      </div>
                      <p className="text-[10px] font-bold">${item.price.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="py-24 text-center border-t border-black">
            <ShoppingBag size={32} strokeWidth={0.5} className="mx-auto text-gray-300 mb-6" />
            <p className="text-xs uppercase tracking-[0.4em] text-gray-300 font-bold">No documented acquisitions found.</p>
          </div>
        )}
      </div>

      <div className="mt-24 pt-12 border-t border-black/10 flex flex-col items-center">
        <p className="text-[9px] uppercase tracking-widest text-gray-400 text-center max-w-sm mb-8">
          All archival acquisitions are subject to our terms of preservation and global delivery protocols.
        </p>
        <button className="flex items-center space-x-3 text-[10px] uppercase tracking-[0.3em] font-black group">
          <span>Request Archive Certification</span>
          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};

export default OrderHistory;
