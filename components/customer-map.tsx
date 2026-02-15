'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Tier color type matching the API
type TierColor = 'green' | 'lightgreen' | 'yellow' | 'orange' | 'red';

// Customer data for the map
export interface MapCustomer {
  id: string;
  name: string;
  permit_number: string;
  trade_name?: string;
  lat: number;
  lng: number;
  address?: string;
  // Revenue fields (optional for backward compatibility)
  total_revenue?: number;
  beer_revenue?: number;
  wine_revenue?: number;
  liquor_revenue?: number;
  // Tier color from API
  tier_color?: TierColor;
  tier_label?: string;
}

interface CustomerMapProps {
  customers: MapCustomer[];
  selectedCustomerId?: string;
  onCustomerClick?: (customerId: string) => void;
  /** Called on pin tap instead of showing popup (for mobile rich popup) */
  onPinTap?: (customer: MapCustomer) => void;
  height?: string;
  showPopups?: boolean;
}

// Brand colors
const COLORS = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

// Tier color hex mapping
const TIER_COLOR_HEX: Record<TierColor, string> = {
  green: '#22c55e',
  lightgreen: '#86efac',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

// Texas center coordinates
const TEXAS_CENTER = {
  lat: 31.0,
  lng: -100.0,
  zoom: 5,
};

// Free tile style - OpenFreeMap (no key required, based on OSM data)
const FREE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export default function CustomerMap({
  customers,
  selectedCustomerId,
  onCustomerClick,
  onPinTap,
  height = '400px',
  showPopups = true,
}: CustomerMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const popupsRef = useRef<Map<string, maplibregl.Popup>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);

  // Filter customers with valid coordinates
  const customersWithCoords = customers.filter(
    (c) => c.lat != null && c.lng != null && !isNaN(c.lat) && !isNaN(c.lng)
  );

  // Create custom marker element with tier coloring
  const createMarkerElement = useCallback(
    (customer: MapCustomer, isSelected: boolean) => {
      const el = document.createElement('div');
      el.className = 'customer-marker';

      const size = isSelected ? 24 : 16;
      // Use tier color if available, otherwise fall back to brand primary
      const tierHex = customer.tier_color
        ? TIER_COLOR_HEX[customer.tier_color]
        : COLORS.primary;
      const color = isSelected ? COLORS.accent : tierHex;
      const borderColor = isSelected ? '#ffffff' : COLORS.primaryDark;

      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background-color: ${color};
        border: 2px solid ${borderColor};
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      `;

      // Hover effects
      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.3)';
        el.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.4)';
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
        el.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)';
      });

      el.dataset.customerId = customer.id;

      return el;
    },
    []
  );

  // Create popup content (used for desktop popups)
  const createPopupContent = useCallback(
    (customer: MapCustomer) => {
      return `
        <div style="
          font-family: system-ui, -apple-system, sans-serif;
          padding: 8px;
          min-width: 180px;
        ">
          <h3 style="
            margin: 0 0 8px 0;
            font-size: 14px;
            font-weight: 600;
            color: ${COLORS.primaryDark};
          ">
            ${customer.name}
          </h3>
          ${
            customer.trade_name
              ? `<p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">
                  <strong>Trade Name:</strong> ${customer.trade_name}
                </p>`
              : ''
          }
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">
            <strong>Permit:</strong> ${customer.permit_number}
          </p>
          ${
            customer.address
              ? `<p style="margin: 0; font-size: 12px; color: #666;">
                  <strong>Address:</strong> ${customer.address}
                </p>`
              : ''
          }
        </div>
      `;
    },
    []
  );

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: FREE_STYLE_URL,
        center: [TEXAS_CENTER.lng, TEXAS_CENTER.lat],
        zoom: TEXAS_CENTER.zoom,
      });

      map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

      map.current.on('load', () => {
        setIsLoading(false);
      });

      map.current.on('error', (e) => {
        console.error('Map error:', e);
        setMapError('Failed to load map tiles. Please try again later.');
        setIsLoading(false);
      });
    } catch (error) {
      console.error('Map initialization error:', error);
      setMapError('Failed to initialize map.');
      setIsLoading(false);
    }

    // Cleanup
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      popupsRef.current.forEach((popup) => popup.remove());
      popupsRef.current.clear();

      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update markers when customers change
  useEffect(() => {
    if (!map.current || isLoading) return;

    // Remove existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    popupsRef.current.forEach((popup) => popup.remove());
    popupsRef.current.clear();

    // Add markers for each customer
    customersWithCoords.forEach((customer) => {
      const isSelected = customer.id === selectedCustomerId;
      const el = createMarkerElement(customer, isSelected);

      // Create marker
      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
      })
        .setLngLat([customer.lng, customer.lat])
        .addTo(map.current!);

      // If onPinTap is provided (mobile), use it instead of popups
      if (onPinTap) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onPinTap(customer);
        });
      } else {
        // Desktop: use popups
        if (showPopups) {
          const popup = new maplibregl.Popup({
            offset: 25,
            closeButton: true,
            closeOnClick: false,
            className: 'customer-popup',
          }).setHTML(createPopupContent(customer));

          popupsRef.current.set(customer.id, popup);
          marker.setPopup(popup);
        }

        // Click handler for desktop
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onCustomerClick) {
            onCustomerClick(customer.id);
          }
        });
      }

      markersRef.current.set(customer.id, marker);
    });

    // Fit bounds if there are multiple customers
    if (customersWithCoords.length > 1 && !selectedCustomerId) {
      const bounds = new maplibregl.LngLatBounds();
      customersWithCoords.forEach((customer) => {
        bounds.extend([customer.lng, customer.lat]);
      });
      map.current.fitBounds(bounds, {
        padding: 50,
        maxZoom: 12,
      });
    } else if (customersWithCoords.length === 1) {
      const customer = customersWithCoords[0];
      map.current.flyTo({
        center: [customer.lng, customer.lat],
        zoom: 10,
      });
    }
  }, [
    customers,
    customersWithCoords,
    selectedCustomerId,
    showPopups,
    onCustomerClick,
    onPinTap,
    createMarkerElement,
    createPopupContent,
    isLoading,
  ]);

  // Handle selected customer changes
  useEffect(() => {
    if (!map.current || isLoading || !selectedCustomerId) return;

    // Update marker styles for selection
    customersWithCoords.forEach((customer) => {
      const marker = markersRef.current.get(customer.id);
      if (!marker) return;

      const el = marker.getElement();
      const isSelected = customer.id === selectedCustomerId;
      const size = isSelected ? 24 : 16;
      const tierHex = customer.tier_color
        ? TIER_COLOR_HEX[customer.tier_color]
        : COLORS.primary;
      const color = isSelected ? COLORS.accent : tierHex;

      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.backgroundColor = color;
    });

    // Find selected customer and fly to it
    const selectedCustomer = customersWithCoords.find(
      (c) => c.id === selectedCustomerId
    );
    if (selectedCustomer) {
      map.current.flyTo({
        center: [selectedCustomer.lng, selectedCustomer.lat],
        zoom: 12,
        duration: 1000,
      });

      // Open popup for selected customer (desktop only, not when onPinTap is used)
      if (showPopups && !onPinTap) {
        const popup = popupsRef.current.get(selectedCustomerId);
        const marker = markersRef.current.get(selectedCustomerId);
        if (popup && marker && !popup.isOpen()) {
          marker.togglePopup();
        }
      }
    }
  }, [selectedCustomerId, customersWithCoords, showPopups, onPinTap, isLoading]);

  // Error state
  if (mapError) {
    return (
      <div
        style={{
          width: '100%',
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.primaryLight,
          borderRadius: '8px',
          border: `1px solid ${COLORS.primary}`,
        }}
      >
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke={COLORS.primary}
            strokeWidth="2"
            style={{ marginBottom: '12px' }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p style={{ color: COLORS.primaryDark, margin: 0 }}>{mapError}</p>
        </div>
      </div>
    );
  }

  // No customers with coordinates
  if (customersWithCoords.length === 0 && !isLoading) {
    return (
      <div
        style={{
          width: '100%',
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.primaryLight,
          borderRadius: '8px',
          border: `1px solid ${COLORS.primary}`,
        }}
      >
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke={COLORS.primary}
            strokeWidth="2"
            style={{ marginBottom: '12px' }}
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <p style={{ color: COLORS.primaryDark, margin: 0 }}>
            No customer locations available
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: COLORS.primaryLight,
            zIndex: 10,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                border: `3px solid ${COLORS.primaryLight}`,
                borderTopColor: COLORS.primary,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: '12px',
              }}
            />
            <p style={{ color: COLORS.primaryDark, margin: 0 }}>
              Loading map...
            </p>
          </div>
        </div>
      )}

      {/* Map container */}
      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: '100%',
        }}
      />

      {/* CSS for spinner animation and popup styles */}
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .customer-popup .maplibregl-popup-content {
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 0;
        }

        .customer-popup .maplibregl-popup-close-button {
          font-size: 18px;
          color: ${COLORS.primaryDark};
          padding: 4px 8px;
        }

        .customer-popup .maplibregl-popup-close-button:hover {
          background-color: ${COLORS.primaryLight};
        }

        .maplibregl-ctrl-group {
          border-radius: 8px !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
        }
      `}</style>
    </div>
  );
}
