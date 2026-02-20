
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Package, Clock, CheckCircle, ChevronRight, ShoppingBag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { OrderRecord } from '../types';
import { sendOrderConfirmationEmail } from '../lib/email';

const OrderHistory: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const { fetchUserOrders, cart, addToast } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailSent, setEmailSent] = useState(false);

  // Check for successful payment and send confirmation email
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentSuccess = params.get('payment') === 'success';
    const orderId = params.get('order_id');

    if (paymentSuccess && orderId && user && !emailSent) {
      // Send confirmation email
      const sendEmail = async () => {
        try {
          const userOrders = await fetchUserOrders(user.id);
          const order = userOrders.find(o => o.id === orderId);

          if (order) {
            const customerName = profile?.full_name || 
                               user.user_metadata?.full_name || 
                               user.email?.split('@')[0] || 
                               'Valued Patron';

            const shippingAddress = profile?.saved_address || 'Address on file';

            const emailSuccess = await sendOrderConfirmationEmail(
              orderId,
              customerName,
              user.email || '',
              order.items.map(item => ({
                product: {
                  id: item.id,
                  name: item.name,
                  price: item.price,
                  category: item.name.split(' ')[0], // approximate category
                  image_url: item.image_url || '',
                  description: '',
                  bottom_price: item.price,
                  tags: []
                },
                quantity: item.quantity
              })),
              order.total_amount,
              shippingAddress
            );

            if (emailSuccess) {
              addToast('✓ Order confirmation email sent successfully!', 'success');
            }
            setEmailSent(true);
            console.log('✅ Order confirmation email sent');
          }
        } catch (error) {
          console.error('Error sending confirmation email:', error);
        }
      };

      sendEmail();
    }
  }, [location, user, profile, fetchUserOrders, emailSent, addToast]);

  useEffect(() => {
    const loadOrders = async () => {
      if (user) {
        setLoading(true);
        const userOrders = await fetchUserOrders(user.id);
        setOrders(userOrders);
        setLoading(false);
      }
    };
    loadOrders();
  }, [user, fetchUserOrders]);

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="modern-loader" />
          <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 animate-pulse">
            Loading Acquisitions...
          </p>
        </div>
      </div>
    );
  }

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
        {orders.length > 0 ? (
          orders.map((order) => (
            <div key={order.id} className="group border-t border-black pt-12 animate-in slide-in-from-bottom-4 duration-700">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8 mb-10">
                <div className="space-y-2">
                  <div className="flex items-center space-x-4">
                    <span className="text-xs font-bold uppercase tracking-[0.2em]">ORD-{order.id}</span>
                    <span className="flex items-center space-x-2 px-3 py-1 bg-gray-50 border border-black/5 rounded-full">
                      {order.status === 'paid' || order.status === 'completed' ? <CheckCircle size={10} /> : <Clock size={10} />}
                      <span className="text-[8px] uppercase tracking-widest font-black italic">{order.status}</span>
                    </span>
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-400 font-medium italic">
                    {new Date(order.created_at).toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
                
                <div className="flex flex-col items-start lg:items-end">
                  <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Total Acquisition</span>
                  <span className="text-2xl font-bold">${order.total_amount.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex space-x-4 border border-black/5 p-4 hover:border-black transition-colors">
                    <div className="w-16 aspect-[3/4] bg-gray-50 border border-black/5 overflow-hidden flex-shrink-0">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package size={24} strokeWidth={0.5} className="text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div>
                        <h4 className="text-[9px] font-bold uppercase tracking-widest leading-tight">{item.name}</h4>
                        <p className="text-[8px] text-gray-400 uppercase tracking-widest mt-1">Quantity: {item.quantity}</p>
                      </div>
                      <p className="text-[10px] font-bold">${item.price.toFixed(2)}</p>
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
            <Link 
              to="/" 
              className="inline-block mt-8 border border-black px-8 py-4 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-black hover:text-white transition-all"
            >
              Browse Collection
            </Link>
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
