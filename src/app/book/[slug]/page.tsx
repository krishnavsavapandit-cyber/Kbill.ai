"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function PublicBookingPage({ params }: { params: { slug: string } }) {
  const [business, setBusiness] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Flow State
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date(Date.now() + 86400000).toISOString().split("T")[0] // tomorrow
  );
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null);

  // Customer Info Form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchBusinessDetails = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/book/${params.slug}`);
        const data = await res.json();

        if (res.ok) {
          setServices(data.services || []);
          setBusiness(data.business);
          if (data.services?.length > 0) {
            setSelectedServiceId(data.services[0].id);
          }
        } else {
          setErrorMessage(data.error || "Business not found.");
        }
      } catch (err: any) {
        console.error(err);
        setErrorMessage("Failed to load business details.");
      } finally {
        setLoading(false);
      }
    };

    fetchBusinessDetails();
  }, [params.slug]);

  // Fetch live slots
  useEffect(() => {
    if (!selectedServiceId || !selectedDate) return;

    const fetchSlots = async () => {
      try {
        setSlotsLoading(true);
        setSelectedSlotTime(null);
        setErrorMessage(null);
        const res = await fetch(
          `/api/appointments/available-slots?serviceId=${selectedServiceId}&date=${selectedDate}&businessSlug=${params.slug}`
        );
        const data = await res.json();
        setAvailableSlots(data.slots || []);
        if (!data.businessOpen) {
          setErrorMessage(data.reason || "We are closed on this date.");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSlotsLoading(false);
      }
    };

    fetchSlots();
  }, [selectedServiceId, selectedDate, params.slug]);

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotTime) {
      setErrorMessage("Please select a time slot.");
      return;
    }
    if (!name.trim() || !phone.trim()) {
      setErrorMessage("Please provide your name and phone number.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug: params.slug,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim(),
          serviceId: selectedServiceId,
          startTime: selectedSlotTime,
          customerNotes: notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to confirm your booking. Please try another slot.");
      } else {
        setBookingConfirmed(data.appointment);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedService = services.find((s) => s.id === selectedServiceId);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 border-3 border-brand-indigo border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs text-slate-500 font-medium">Loading booking portal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 py-10 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Business Branding Header */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-brand-blue to-brand-indigo flex items-center justify-center font-bold text-white text-lg shadow-md shadow-brand-indigo/20">
              AD
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">{business?.name || "Apex Digital Solutions"}</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Verified
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-slate-400" />
                Bandra Kurla Complex, Mumbai • +91 98765 00000
              </p>
            </div>
          </div>

          <div className="text-right hidden sm:block">
            <span className="text-[11px] text-slate-500 font-medium">Instant Online Confirmation</span>
            <p className="text-xs font-semibold text-brand-indigo">Powered by SlotWise AI</p>
          </div>
        </div>

        {/* Confirmation Success View */}
        {bookingConfirmed ? (
          <div className="bg-white rounded-2xl p-8 border border-slate-200/80 shadow-md text-center space-y-5 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Appointment Confirmed!</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Thank you, <strong>{bookingConfirmed.customer?.name}</strong>. Your appointment has been locked in with zero double-booking.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left text-xs space-y-2 max-w-md mx-auto">
              <div className="flex justify-between">
                <span className="text-slate-500">Service:</span>
                <span className="font-semibold text-slate-900">{bookingConfirmed.service?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date & Time:</span>
                <span className="font-semibold text-slate-900 font-mono">
                  {formatDateTime(bookingConfirmed.startTime)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration:</span>
                <span className="font-semibold text-slate-900">{bookingConfirmed.service?.durationMinutes} minutes</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                <span className="text-slate-700">Fee:</span>
                <span className="text-brand-indigo">{formatCurrency(bookingConfirmed.service?.price || 0)}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 max-w-md mx-auto">
              A confirmation and reminder will be delivered to your WhatsApp number ({bookingConfirmed.customer?.phone}).
            </div>

            <button
              onClick={() => {
                setBookingConfirmed(null);
                setSelectedSlotTime(null);
              }}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
            >
              Book Another Session
            </button>
          </div>
        ) : (
          /* Booking Form */
          <form onSubmit={handleSubmitBooking} className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Step 1: Select Service */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-brand-indigo text-white text-[10px] flex items-center justify-center font-bold">1</span>
                Select Service
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedServiceId(s.id)}
                    className={`p-3.5 rounded-xl text-left border transition-all ${
                      selectedServiceId === s.id
                        ? "border-brand-indigo bg-indigo-50/60 shadow-xs"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">{s.name}</h4>
                    <p className="text-[10px] text-slate-500 mt-1">{s.durationMinutes} mins</p>
                    <p className="text-xs font-bold text-brand-indigo mt-2">{formatCurrency(s.price)}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Choose Date & Time */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-brand-indigo text-white text-[10px] flex items-center justify-center font-bold">2</span>
                Choose Date & Real-Time Available Slot
              </label>

              <div>
                <input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-indigo font-medium"
                  required
                />
              </div>

              {/* Slots Grid */}
              <div>
                <span className="text-[11px] text-slate-500 font-medium block mb-2">
                  Available start times for {new Date(selectedDate).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}:
                </span>

                {slotsLoading ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Checking live calendar availability...
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed">
                    No available time slots on this date.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {availableSlots.map((slot, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedSlotTime(slot.startTime)}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold text-center border transition-all ${
                          !slot.available
                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60 line-through"
                            : selectedSlotTime === slot.startTime
                            ? "bg-brand-indigo text-white border-brand-indigo shadow-xs"
                            : "bg-white text-slate-800 border-slate-300 hover:border-brand-indigo"
                        }`}
                      >
                        {slot.timeLabel}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Your Contact Details */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-brand-indigo text-white text-[10px] flex items-center justify-center font-bold">3</span>
                Your Details
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vikram Malhotra"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">WhatsApp Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98123 45678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo font-mono"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-slate-600 font-semibold mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="vikram@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                />
              </div>

              <div className="text-xs">
                <label className="block text-slate-600 font-semibold mb-1">Notes / Specific Requirements</label>
                <textarea
                  rows={2}
                  placeholder="Briefly describe what you would like to discuss..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                />
              </div>
            </div>

            {/* Submission */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {selectedService && (
                  <span>
                    Selected: <strong>{selectedService.name}</strong> • {formatCurrency(selectedService.price)}
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || !selectedSlotTime}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-brand-indigo hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all disabled:opacity-50"
              >
                {submitting ? "Confirming Slot..." : "Confirm My Appointment"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
