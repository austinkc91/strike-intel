import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../services/firebase';
import type { Catch, CatchFormData } from '../types';

export function useCatches(lakeId: string | null) {
  const [catches, setCatches] = useState<Catch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lakeId) {
      setCatches([]);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'lakes', lakeId, 'catches'),
      orderBy('timestamp', 'desc'),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const results: Catch[] = snap.docs.map((d) => ({
          id: d.id,
          lakeId,
          ...d.data(),
        })) as Catch[];
        setCatches(results);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching catches:', err);
        setLoading(false);
      },
    );

    return unsub;
  }, [lakeId]);

  const addCatch = useCallback(
    async (data: CatchFormData) => {
      if (!lakeId) throw new Error('No lake selected');
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');

      let photoUrl: string | null = null;
      if (data.photo) {
        const photoRef = ref(
          storage,
          `catches/${lakeId}/${user.uid}/${Date.now()}_${data.photo.name}`,
        );
        await uploadBytes(photoRef, data.photo);
        photoUrl = await getDownloadURL(photoRef);
      }

      const catchDoc = {
        userId: user.uid,
        location: {
          latitude: data.location.latitude,
          longitude: data.location.longitude,
        },
        timestamp: Timestamp.fromDate(data.timestamp),
        loggedAt: Timestamp.now(),
        species: data.species || null,
        weight_lbs: data.weight_lbs ? parseFloat(data.weight_lbs) : null,
        length_in: data.length_in ? parseFloat(data.length_in) : null,
        lure: data.lure || null,
        notes: data.notes || null,
        photo: photoUrl,
        photoSource: data.photoSource,
        characteristics: null,
        weather: null,
        solunar: null,
      };

      await addDoc(collection(db, 'lakes', lakeId, 'catches'), catchDoc);
    },
    [lakeId],
  );

  const removeCatch = useCallback(
    async (catchId: string) => {
      if (!lakeId) return;
      await deleteDoc(doc(db, 'lakes', lakeId, 'catches', catchId));
    },
    [lakeId],
  );

  return { catches, loading, addCatch, removeCatch };
}
