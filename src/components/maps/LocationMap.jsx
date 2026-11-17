import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
function MapViewport({ lat, lng }) {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lng], map.getZoom());
    }, [lat, lng, map]);
    return null;
}
function MapPicker({ onSelect, interactive }) {
    useMapEvents({
        click(event) {
            if (interactive)
                onSelect?.(event.latlng.lat, event.latlng.lng);
        },
    });
    return null;
}
export function LocationMap({ lat, lng, onSelect, interactive = true, }) {
    return (<MapContainer center={[lat, lng]} zoom={13} scrollWheelZoom={interactive} className="h-full w-full">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors"/>
      <MapViewport lat={lat} lng={lng}/>
      <MapPicker onSelect={onSelect} interactive={interactive}/>
      <Marker position={[lat, lng]} draggable={interactive} eventHandlers={{
            dragend(event) {
                const position = event.target.getLatLng();
                onSelect?.(position.lat, position.lng);
            },
        }}/>
    </MapContainer>);
}
