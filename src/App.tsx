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
import Spotlist from './pages/Spotlist';
import QuestMaker from './pages/QuestMaker';
import { PlacesProvider } from './context/PlacesContext';
import { CollectionsProvider } from './context/CollectionsContext';
import { SpotlistProvider } from './context/SpotlistContext';

export default function App() {
  return (
    <PlacesProvider>
      <SpotlistProvider>
      <CollectionsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Discover />} />
            <Route path="map-editor" element={<MapEditor />} />
            <Route path="collections" element={<Collections />} />
            <Route path="saved" element={<SavedPlaces />} />
            <Route path="spotlist" element={<Spotlist />} />
            <Route path="quest-maker" element={<QuestMaker />} />

            {/* Catch-all to default to home/discover */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </CollectionsProvider>
      </SpotlistProvider>
    </PlacesProvider>
  );
}
