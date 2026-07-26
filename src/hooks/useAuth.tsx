import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import AuthService from '../services/AuthService';
import SecureStorageService from '../services/SecureStorageService';
import { UserProfile } from '../types';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: User | null;
  loading: boolean;
  signIn: typeof AuthService.signIn;
  signInWithGoogle: typeof AuthService.signInWithGoogle;
  signUp: typeof AuthService.signUp;
  signOut: typeof AuthService.signOut;
  updateProfile: (updates: Partial<UserProfile>) => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Pre-load securely stored profile instantly on startup to eliminate loading delays
  useEffect(() => {
    async function loadCachedSession() {
      try {
        const cachedProfile = await SecureStorageService.getUserProfile();
        if (cachedProfile) {
          setUser(cachedProfile);
        }
      } catch (e) {
        console.warn('AuthProvider: Failed to load cached secure session profile:', e);
      }
    }
    loadCachedSession();
  }, []);

  useEffect(() => {
    let authFired = false;
    
    // Safety fallback: if Firebase Auth state listener doesn't respond in 3s, unblock app gracefully
    const safetyTimeout = setTimeout(() => {
      if (!authFired) {
        console.warn('AuthProvider: Auth state listener fallback triggered.');
        setLoading(false);
      }
    }, 3000);

    const unsubscribe = AuthService.subscribeToAuthChanges(async (fUser: User | null) => {
      authFired = true;
      clearTimeout(safetyTimeout);
      
      setFirebaseUser(fUser);
      if (fUser) {
        try {
          const profile = await AuthService.getUserProfile(fUser.uid);
          if (profile) {
            setUser(profile);
          } else {
            setUser(null);
            await SecureStorageService.clearAuthData();
          }
        } catch (e) {
          console.error('AuthProvider: Error restoring user profile:', e);
          setUser(null);
        }
      } else {
        setUser(null);
        await SecureStorageService.clearAuthData();
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, []);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return null;
    const updated = await AuthService.updateUserProfile(user.uid, updates);
    setUser(updated);
    return updated;
  };

  const signIn = async (email: string, password: string) => {
    const profile = await AuthService.signIn(email, password);
    setUser(profile);
    return profile;
  };

  const signInWithGoogle = async () => {
    const profile = await AuthService.signInWithGoogle();
    setUser(profile);
    return profile;
  };

  const signUp = async (email: string, password: string, name: string, bikeName?: string) => {
    const profile = await AuthService.signUp(email, password, name, bikeName);
    setUser(profile);
    return profile;
  };

  const signOut = async () => {
    await AuthService.signOut();
    setUser(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, signInWithGoogle, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
