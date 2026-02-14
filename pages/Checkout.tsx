
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, CreditCard, Truck, ShieldCheck, Tag, Lock, User as UserIcon, MapPin, Navigation, Globe, Check } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const Checkout: React.FC = () => {
  const { cart, clearCart, cartSubtotal, cartTotal, negotiatedDiscount, appliedCoupon, addToast, logClerkInteraction } = useStore();
  const { user, profile, loading, setAuthModalOpen, updateProfile } = useAuth();
  const navigate = useNavigate();
  
  const [isOrdered, setIsOrdered] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  
  // Shipping State
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [useSavedAddress, setUseSavedAddress] = useState(false);
  
  const [locationCoords, setLocationCoords] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (cart.length === 0 && !isOrdered) {
      navigate('/');
    }
  }, [cart.length, isOrdered, navigate]);

  // Handle Saved Address Initialization
  useEffect(() => {
    if (profile?.saved_address) {
      setUseSavedAddress(true);
      setAddress(profile.saved_address);
      setCity(profile.saved_city || '');
      setPostalCode(profile.saved_postal || '');
    }
  }, [profile]);

  const handleLocateMe = () => {
    setIsLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocationCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setIsLocating(false);
          addToast('Coordinates synchronized with current frame.', 'success');
        },
        (error) => {
          console.error("Error fetching location", error);
          setIsLocating(false);
          addToast('Cartographic lock failed.', 'error');
        },
        { enableHighAccuracy: true }
      );
    }
  };

  const mapQuery = useMemo(() => {
    if (locationCoords) return `${locationCoords.lat},${locationCoords.lng}`;
    const fullAddress = [address, city, postalCode].filter(Boolean).join(' ');
    return fullAddress ? encodeURIComponent(fullAddress) : null;
  }, [locationCoords, address, city, postalCode]);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    
    try {
      const shippingMetadata = {
        address,
        city,
        postal_code: postalCode,
        coordinates: locationCoords
      };

      // 1. Record Checkout in Supabase orders table
      const { error: checkoutError } = await supabase
        .from('checkouts')
        .insert({
          user_id: user?.id || null,
          email: user?.email || guestEmail,
          items: cart.map(item => ({
            id: item.product.id,
            name: item.product.name,
            quantity: item.quantity,
            price: item.product.price
          })),
          total_amount: cartTotal,
          shipping_address: shippingMetadata,
          status: 'pending'
        });

      if (checkoutError) throw checkoutError;

      // 2. Audit Log (as requested: save cart snapshot and shipping to clerk_logs)
      await logClerkInteraction({
        user_id: user?.id,
        user_email: user?.email || guestEmail,
        user_message: "SYSTEM_CHECKOUT_EVENT",
        clerk_response: "Acquisition documented and archived.",
        clerk_sentiment: 'happy',
        cart_snapshot: cart.map(item => ({ 
          id: item.product.id, 
          qty: item.quantity, 
          price: item.product.price 
        })),
        checkout_details: { 
          shipping_address: shippingMetadata,
          payment_method: 'Stripe_Card_Primary'
        },
        negotiation_successful: true,
        discount_offered: negotiatedDiscount
      });

      // 3. Persist Address to Profile if opted-in
      if (user && saveAddress) {
        await updateProfile({
          saved_address: address,
          saved_city: city,
          saved_postal: postalCode
        });
      }

      // Simulate external payment processing latency
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setIsProcessing(false);
      setIsOrdered(true);
      clearCart();
      addToast('Acquisition archived successfully.', 'success');
    } catch (err: any) {
      console.error(err);
      setIsProcessing(false);
      addToast('Acquisition finalization failed: ' + err.message, 'error');
    }
  };

  const toggleSavedAddress = () => {
    if (!useSavedAddress && profile?.saved_address) {
      setAddress(profile.saved_address);
      setCity(profile.saved_city || '');
      setPostalCode(profile.saved_postal || '');
    } else {
      setAddress('');
      setCity('');
      setPostalCode('');
    }
    setUseSavedAddress(!useSavedAddress);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
        <div className="flex flex-col items-center space-y-4">
          <div className="modern-loader" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-gray-400 dark:text-gray-500 font-bold">Verifying Session</span>
        </div>
      </div>
    );
  }

  if (isOrdered) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-700 bg-white dark:bg-black">
        <CheckCircle size={64} strokeWidth={1} className="text-black dark:text-white mb-8" />
        <h1 className="font-serif-elegant text-4xl md:text-6xl font-bold uppercase tracking-tight mb-4 text-black dark:text-white">Confirmed</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm uppercase tracking-[0.2em] mb-12 max-w-md mx-auto leading-relaxed">
          Your order has been placed in our archive. You will receive a confirmation email shortly with tracking details.
        </p>
        <Link to="/" className="border border-black dark:border-white px-12 py-5 text-xs font-bold uppercase tracking-[0.3em] text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">
          Return to Archive
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-12 animate-in fade-in duration-700 bg-white dark:bg-black">
      <Link to="/" className="flex items-center space-x-2 text-xs uppercase tracking-widest font-bold mb-12 text-black dark:text-white hover:opacity-50 transition-opacity">
        <ArrowLeft size={16} />
        <span>Continue Browsing</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        <div className="lg:col-span-7 space-y-12">
          {!user && (
            <div className="bg-gray-50 dark:bg-neutral-900/50 border border-black dark:border-white/20 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center space-x-4">
                <UserIcon size={24} strokeWidth={1} className="text-black dark:text-white" />
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-black dark:text-white">Authenticated Experience</h3>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1">Sign in to track orders and save your archive profile.</p>
                </div>
              </div>
              <button 
                onClick={() => setAuthModalOpen(true)}
                className="whitespace-nowrap bg-black dark:bg-white text-white dark:text-black px-8 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white border border-black dark:border-white transition-all"
              >
                Sign In
              </button>
            </div>
          )}

          <section className="space-y-8">
            <div className="flex justify-between items-end border-b border-black dark:border-white pb-4">
              <h2 className="font-serif-elegant text-3xl font-bold uppercase tracking-widest text-black dark:text-white">
                Shipping Details
              </h2>
              {profile?.saved_address && (
                <button 
                  onClick={toggleSavedAddress}
                  className={`text-[8px] uppercase tracking-widest font-black px-4 py-2 border transition-all ${useSavedAddress ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white' : 'bg-transparent text-gray-400 border-gray-200 dark:border-gray-700 hover:border-black dark:hover:border-white hover:text-black dark:hover:text-white'}`}
                >
                  {useSavedAddress ? 'Using Saved Destination' : 'Load Saved Destination'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <form id="checkout-form" onSubmit={handlePlaceOrder} className="space-y-6">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold mb-2 text-black dark:text-white">Email Address</label>
                  {user ? (
                    <div className="w-full border-b border-black/10 dark:border-white/10 py-3 text-sm uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {user.email}
                    </div>
                  ) : (
                    <input 
                      required 
                      type="email" 
                      placeholder="EMAIL@EXAMPLE.COM" 
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="w-full border-b border-black/10 dark:border-white/10 focus:border-black dark:focus:border-white outline-none py-3 text-sm uppercase tracking-wider bg-transparent text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-colors" 
                    />
                  )}
                </div>
                
                <div className="space-y-6 relative">
                  {useSavedAddress && (
                    <div className="absolute inset-0 z-10 bg-white/40 dark:bg-black/40 backdrop-blur-[1px] flex items-start justify-end p-2 pointer-events-none">
                       <Check size={16} className="text-black dark:text-white" />
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold mb-2 text-black dark:text-white">Shipping Address</label>
                    <input 
                      required 
                      disabled={useSavedAddress}
                      type="text" 
                      placeholder="STREET ADDRESS" 
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full border-b border-black/10 dark:border-white/10 focus:border-black dark:focus:border-white outline-none py-3 text-sm uppercase tracking-wider bg-transparent text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-colors disabled:text-gray-400 dark:disabled:text-gray-600" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-bold mb-2 text-black dark:text-white">City</label>
                      <input 
                        required 
                        disabled={useSavedAddress}
                        type="text" 
                        placeholder="CITY" 
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full border-b border-black/10 dark:border-white/10 focus:border-black dark:focus:border-white outline-none py-3 text-sm uppercase tracking-wider bg-transparent text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-colors disabled:text-gray-400 dark:disabled:text-gray-600" 
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-bold mb-2 text-black dark:text-white">Postal Code</label>
                      <input 
                        required 
                        disabled={useSavedAddress}
                        type="text" 
                        placeholder="POSTAL" 
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="w-full border-b border-black/10 dark:border-white/10 focus:border-black dark:focus:border-white outline-none py-3 text-sm uppercase tracking-wider bg-transparent text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 transition-colors disabled:text-gray-400 dark:disabled:text-gray-600" 
                      />
                    </div>
                  </div>
                </div>

                {user && (
                  <div className="flex items-center space-x-3 pt-4">
                    <button 
                      type="button"
                      onClick={() => setSaveAddress(!saveAddress)}
                      className={`w-5 h-5 border flex items-center justify-center transition-all ${saveAddress ? 'bg-black dark:bg-white border-black dark:border-white' : 'border-gray-200 dark:border-gray-700'}`}
                    >
                      {saveAddress && <Check size={12} className="text-white dark:text-black" />}
                    </button>
                    <span className="text-[10px] uppercase tracking-widest font-black text-gray-500 dark:text-gray-400">Document this location for future acquisitions</span>
                  </div>
                )}
                
                <div className="pt-8">
                  <button 
                    type="button"
                    onClick={handleLocateMe}
                    className="flex items-center space-x-2 text-[8px] uppercase tracking-[0.3em] font-black text-black dark:text-white hover:opacity-50 transition-opacity group"
                  >
                    <Navigation size={10} className={`${isLocating ? 'animate-pulse' : 'group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform'}`} />
                    <span>Synchronize with Current Coordinates</span>
                  </button>
                </div>
              </form>

              <div className="space-y-4">
                <label className="block text-[10px] uppercase tracking-widest font-bold mb-2 flex items-center justify-between text-black dark:text-white">
                  <span>Cartographic Verification</span>
                  {locationCoords && (
                    <span className="text-[8px] text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 border border-green-100 dark:border-green-900/50 flex items-center gap-1">
                      <Lock size={8} /> Coordinate Lock
                    </span>
                  )}
                </label>
                <div className="aspect-square bg-white dark:bg-neutral-900 border border-black dark:border-white/20 relative overflow-hidden group">
                  {mapQuery ? (
                    <div className="w-full h-full relative">
                      <iframe
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        title="Modernist Map View"
                        style={{ border: 0, filter: 'grayscale(1) contrast(1.2) brightness(0.95) invert(0.02)' }}
                        src={`https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                        allowFullScreen
                      ></iframe>
                      <div className="absolute inset-4 border border-black/5 dark:border-white/5 pointer-events-none" />
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-black dark:border-white pointer-events-none" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-black dark:border-white pointer-events-none" />
                      <div className="absolute bottom-4 right-4 bg-white dark:bg-black border border-black dark:border-white px-2 py-1 text-[8px] uppercase tracking-widest font-black text-black dark:text-white flex items-center gap-2">
                        <Globe size={10} className="animate-spin-slow" />
                        {locationCoords ? `GPS: ${locationCoords.lat.toFixed(4)}, ${locationCoords.lng.toFixed(4)}` : 'Archival Destination Synced'}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center space-y-4 opacity-20 grayscale bg-gray-50 dark:bg-neutral-900">
                      <MapPin size={32} strokeWidth={1} className="text-black dark:text-white" />
                      <span className="text-[8px] uppercase tracking-[0.4em] font-bold text-black dark:text-white">Awaiting Coordinates</span>
                    </div>
                  )}
                  {isLocating && (
                    <div className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 z-10">
                      <div className="w-8 h-8 border border-black dark:border-white border-t-transparent animate-spin rounded-full" />
                      <span className="text-[8px] uppercase tracking-[0.4em] font-black text-black dark:text-white animate-pulse">Requesting Permission...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-8">
            <h2 className="font-serif-elegant text-3xl font-bold uppercase tracking-widest border-b border-black dark:border-white pb-4 text-black dark:text-white">Payment</h2>
            <div className="space-y-6">
              <div className="border border-black dark:border-white p-6 flex items-center justify-between bg-black dark:bg-white text-white dark:text-black">
                <div className="flex items-center space-x-4">
                  <CreditCard size={20} strokeWidth={1} />
                  <span className="text-xs uppercase tracking-widest font-bold">Secure Card Processing</span>
                </div>
                <ShieldCheck size={16} />
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-5">
          <div className="sticky top-32 space-y-8 bg-gray-50 dark:bg-neutral-900/50 p-8 border border-black/5 dark:border-white/10">
            <h3 className="text-xs uppercase tracking-[0.3em] font-bold border-b border-black dark:border-white pb-4 text-black dark:text-white">Acquisition Summary</h3>
            <div className="max-h-80 overflow-y-auto no-scrollbar space-y-6 pr-2">
              {cart.map((item) => (
                <div key={item.product.id} className="flex space-x-4">
                  <div className="w-20 aspect-[3/4] bg-white dark:bg-neutral-800 border border-black/5 dark:border-white/10 overflow-hidden flex-shrink-0">
                    <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 flex flex-col justify-between py-1">
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-widest leading-tight text-black dark:text-white">{item.product.name}</h4>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-xs font-bold text-black dark:text-white">${(item.product.price * item.quantity).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-6 border-t border-black/10 dark:border-white/10">
              <div className="flex justify-between text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400 font-bold">
                <span>Subtotal</span>
                <span>${cartSubtotal.toLocaleString()}</span>
              </div>
              {negotiatedDiscount > 0 && (
                <div className="flex justify-between text-[10px] uppercase tracking-widest text-green-600 dark:text-green-400 font-bold">
                  <span className="flex items-center gap-1"><Tag size={12} /> Discount Applied</span>
                  <span>-{negotiatedDiscount}%</span>
                </div>
              )}
              <div className="flex justify-between items-end pt-6 border-t border-black dark:border-white mt-6">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-black dark:text-white">Total</span>
                <span className="text-2xl font-bold text-black dark:text-white">${cartTotal.toLocaleString()}</span>
              </div>
            </div>

            <button 
              type="submit" form="checkout-form" disabled={isProcessing}
              className="w-full bg-black dark:bg-white text-white dark:text-black py-6 text-xs uppercase tracking-[0.3em] font-bold flex items-center justify-center space-x-3 hover:bg-white hover:text-black dark:hover:bg-black dark:hover:text-white border border-black dark:border-white transition-all group disabled:opacity-50"
            >
              {isProcessing ? <span className="animate-pulse tracking-widest uppercase">Securing Acquisition...</span> : <span>Confirm & Pay</span>}
            </button>
            <div className="flex items-center justify-center space-x-2 opacity-30 text-[8px] uppercase tracking-widest font-bold text-black dark:text-white">
              <Lock size={10} />
              <span>SSL SECURED ARCHIVE PAYMENT</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
