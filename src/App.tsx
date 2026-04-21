/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Discover from './pages/Discover';
import MapEditor from './pages/MapEditor';
import Collections from './pages/Collections';
import SavedPlaces from './pages/SavedPlaces';
import { PlacesProvider } from './context/PlacesContext';
import { CollectionsProvider } from './context/CollectionsContext';

export default function App() {
  return (
    <PlacesProvider>
      <CollectionsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Discover />} />
            <Route path="map-editor" element={<MapEditor />} />
            <Route path="collections" element={<Collections />} />
            <Route path="saved" element={<SavedPlaces />} />

            {/* Catch-all to default to home/discover */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </CollectionsProvider>
    </PlacesProvider>
  );
}
