"use client";

import { useEffect, useState } from "react";
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Layers,
  Sparkles,
} from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function AppointmentsPage() {
  const [activeTab, setActiveTab] = useState<"appointments" | "services">("appointments");
  const [appointments, setAppointments] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Booking Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    new Date(Date.now() + 86400000).toISOString().split("T")[0] // tomorrow
  );
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Service Creation State
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDesc, setNewServiceDesc] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState(30);
  const [newServiceBuffer, setNewServiceBuffer] = useState(10);
  const [newServicePrice, setNewServicePrice] = useState(999);
  const [creatingService, setCreatingService] = useState(false);

  const [copiedLink, setCopiedLink] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [aptRes, srvRes, custRes] = await Promise.all([
        fetch("/api/appointments"),
        fetch("/api/services"),
        fetch("/api/customers"),
      ]);
      const [aptData, srvData, custData] = await Promise.all([
        aptRes.json(),
        srvRes.json(),
        custRes.json(),
      ]);

      setAppointments(aptData.appointments || []);
      setServices(srvData.services || []);
      setCustomers(custData.customers || []);

      if (srvData.services?.length > 0 && !selectedServiceId) {
        setSelectedServiceId(srvData.services[0].id);
      }
      if (custData.customers?.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(custData.customers[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch real-time available slots when service or date changes
  useEffect(() => {
    if (!selectedServiceId || !selectedDate) return;

    const fetchSlots = async () => {
      try {
        setSlotsLoading(true);
        setSelectedSlotTime(null);
        setBookingError(null);
        const res = await fetch(
          `/api/appointments/available-slots?serviceId=${selectedServiceId}&date=${selectedDate}`
        );
        const data = await res.json();
        setAvailableSlots(data.slots || []);
        if (!data.businessOpen) {
          setBookingError(data.reason || "Business is closed on this date.");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSlotsLoading(false);
      }
    };

    fetchSlots();
  }, [selectedServiceId, selectedDate]);

  // Submit appointment
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotTime) {
      setBookingError("Please select an available time slot.");
      return;
    }
    try {
      setSubmitting(true);
      setBookingError(null);
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          serviceId: selectedServiceId,
          startTime: selectedSlotTime,
          customerNotes: notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setBookingError(data.error || "Failed to confirm appointment");
      } else {
        setShowModal(false);
        fetchData();
      }
    } catch (err: any) {
      setBookingError(err.message || "Failed to connect to server");
    } finally {
      setSubmitting(false);
    }
  };

  // Status Change (Completed / Cancelled)
  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Service
  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) return;
    try {
      setCreatingService(true);
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newServiceName.trim(),
          description: newServiceDesc.trim(),
          durationMinutes: newServiceDuration,
          bufferMinutes: newServiceBuffer,
          price: newServicePrice,
        }),
      });
      if (res.ok) {
        setNewServiceName("");
        setNewServiceDesc("");
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingService(false);
    }
  };

  const copyBookingLink = () => {
    const url = `${window.location.origin}/book/apex-digital`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">SlotWise AI</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-brand-purple border border-purple-200">
              Double-Booking Prevention Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time database availability check, duration buffering, and customer booking portal.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={copyBookingLink}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? "Link Copied!" : "Share Booking Link"}</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-indigo hover:bg-indigo-700 text-white shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Book Appointment</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("appointments")}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "appointments"
              ? "border-brand-indigo text-brand-indigo"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          <span>Scheduled Appointments ({appointments.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("services")}
          className={`pb-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "services"
              ? "border-brand-indigo text-brand-indigo"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Service Durations & Pricing ({services.length})</span>
        </button>
      </div>

      {/* Tab 1: Scheduled Appointments */}
      {activeTab === "appointments" && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No appointments scheduled. Click &quot;Book Appointment&quot; to create one.
                    </td>
                  </tr>
                ) : (
                  appointments.map((apt) => (
                    <tr key={apt.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        {formatDateTime(apt.startTime)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{apt.customer?.name}</div>
                        <div className="text-[10px] text-slate-400">{apt.customer?.phone}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{apt.service?.name}</td>
                      <td className="py-3 px-4 text-slate-500">{apt.service?.durationMinutes} mins</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            apt.status === "CONFIRMED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : apt.status === "COMPLETED"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {apt.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {apt.status === "CONFIRMED" && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(apt.id, "COMPLETED")}
                                className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-medium"
                              >
                                Mark Done
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(apt.id, "CANCELLED")}
                                className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-medium"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Service Configuration */}
      {activeTab === "services" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {services.map((srv) => (
                <div key={srv.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-2">
                  <div className="flex items-start justify-between">
                    <h4 className="text-sm font-bold text-slate-900">{srv.name}</h4>
                    <span className="text-sm font-bold font-mono text-brand-indigo">
                      {formatCurrency(srv.price)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2">{srv.description || "No description."}</p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                    <span>Duration: <strong>{srv.durationMinutes}m</strong></span>
                    <span>Buffer: <strong>{srv.bufferMinutes}m</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Service Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Add New Service</h3>
            <form onSubmit={handleCreateService} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Service Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Consultation"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Service scope..."
                  value={newServiceDesc}
                  onChange={(e) => setNewServiceDesc(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Duration (m)</label>
                  <input
                    type="number"
                    min="10"
                    step="5"
                    value={newServiceDuration}
                    onChange={(e) => setNewServiceDuration(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border rounded-lg text-right"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Buffer (m)</label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={newServiceBuffer}
                    onChange={(e) => setNewServiceBuffer(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border rounded-lg text-right"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={newServicePrice}
                    onChange={(e) => setNewServicePrice(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border rounded-lg text-right font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={creatingService}
                className="w-full mt-2 py-2 rounded-lg bg-brand-indigo text-white font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {creatingService ? "Creating..." : "Save Service"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Real-Time Booking Dialog with Dynamic Slot Availability */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Book Appointment</h3>
                <p className="text-xs text-slate-500">
                  Select customer, service, and live available slot.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {bookingError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{bookingError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAppointment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Customer *</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                  required
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Service *</label>
                  <select
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                    required
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.durationMinutes}m • ₹{s.price})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Date *</label>
                  <input
                    type="date"
                    value={selectedDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                    required
                  />
                </div>
              </div>

              {/* Dynamic Slot Availability Grid */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5 flex items-center justify-between">
                  <span>Available Time Slots *</span>
                  <span className="text-[10px] text-slate-500 font-normal">Real-time database check</span>
                </label>

                {slotsLoading ? (
                  <div className="py-6 text-center text-slate-400">Loading availability...</div>
                ) : availableSlots.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed">
                    No slots available on this date.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                    {availableSlots.map((slot, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setSelectedSlotTime(slot.startTime)}
                        className={`py-2 px-2 rounded-lg text-[11px] font-semibold text-center border transition-all ${
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

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Notes / Instructions</label>
                <textarea
                  rows={2}
                  placeholder="Meeting agenda or customer request..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedSlotTime}
                  className="px-5 py-2 font-semibold bg-brand-indigo hover:bg-indigo-700 text-white rounded-lg shadow-xs transition-colors disabled:opacity-50"
                >
                  {submitting ? "Confirming..." : "Confirm Booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
