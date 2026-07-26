import {
  signInWithEmailAndPassword as firebaseSignIn,
  createUserWithEmailAndPassword as firebaseSignUp,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseAuthStateChanged,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { auth, db } from '../firebase/config';
import { UserProfile } from '../types';
import SecureStorageService from './SecureStorageService';

// Initialize Google Sign-In SDK safely
try {
        GoogleSignin.configure({
        scopes: ['email', 'profile'],
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '892441005808-7m2r5cobclf3frm1pj3tqjaqffmkbsfa.apps.googleusercontent.com',
      });
} catch (e) {
  console.warn('GoogleSignin configure warning:', e);
}

export const AuthService = {
  /**
   * Listen to live auth state changes with automatic token validation
   */
  subscribeToAuthChanges(callback: (user: FirebaseUser | null) => void) {
    return firebaseAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Verify & automatically refresh ID token using refresh token
          await user.getIdTokenResult(false);
        } catch (error) {
          console.warn('AuthService: Session token validation failed, signing out:', error);
          await this.signOut();
          callback(null);
          return;
        }
      }
      callback(user);
    });
  },

  /**
   * Get cached user profile from SecureStore for instant app launch (0ms delay)
   */
  async getCachedUserProfile(): Promise<UserProfile | null> {
    return await SecureStorageService.getUserProfile();
  },

  /**
   * Sign in using email & password with secure credential persistence
   */
  async signIn(email: string, password: string): Promise<UserProfile> {
    const credential = await firebaseSignIn(auth, email, password);
    let profile = await this.getUserProfile(credential.user.uid);
    if (!profile) {
      // Auto-repair missing Firestore profile for accounts whose profile creation failed previously
      profile = {
        uid: credential.user.uid,
        name: credential.user.displayName || email.split('@')[0],
        email: credential.user.email || email,
        bikeName: 'Motorcycle',
        createdAt: Date.now(),
      };
      await setDoc(doc(db, 'users', credential.user.uid), profile);
    }
    await SecureStorageService.saveUserProfile(profile);
    return profile;
  },

  /**
   * Production Google Sign-In authentication linked directly to Firebase
   */
  async signInWithGoogle(): Promise<UserProfile> {
    try {
      GoogleSignin.configure({
        scopes: ['email', 'profile'],
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '892441005808-bikerradar.apps.googleusercontent.com',
      });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken || (signInResult as any).idToken;

      if (!idToken) {
        throw new Error('Unable to connect to Google.');
      }

      const googleCredential = GoogleAuthProvider.credential(idToken);
      const credential = await signInWithCredential(auth, googleCredential);

      let profile = await this.getUserProfile(credential.user.uid);
      if (!profile) {
        profile = {
          uid: credential.user.uid,
          name: credential.user.displayName || credential.user.email?.split('@')[0] || 'Rider',
          email: credential.user.email || '',
          bikeName: 'Motorcycle',
          createdAt: Date.now(),
        };
        await setDoc(doc(db, 'users', credential.user.uid), profile);
      }
      await SecureStorageService.saveUserProfile(profile);
      return profile;
    } catch (error: any) {
      console.error('=== GOOGLE SIGN-IN EXCEPTION ===');
      console.error('Code:', error?.code);
      console.error('Message:', error?.message);
      console.error('Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error('Sign-in cancelled.');
      } else if (error?.code === statusCodes.IN_PROGRESS) {
        throw new Error('Sign-in already in progress.');
      } else if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services unavailable on this device.');
      }

      // Preserve raw error code & details so development mode displays exact exception
      throw error;
    }
  },

  /**
   * Register a new user with profile info and save securely
   */
  async signUp(
    email: string,
    password: string,
    name: string,
    bikeName?: string
  ): Promise<UserProfile> {
    const credential = await firebaseSignUp(auth, email, password);
    const uid = credential.user.uid;
    const profile: UserProfile = {
      uid,
      name: name.trim(),
      email: email.trim(),
      bikeName: bikeName && bikeName.trim() ? bikeName.trim() : 'Motorcycle',
      createdAt: Date.now(),
    };
    
    // Save profile to Firestore and SecureStore
    await setDoc(doc(db, 'users', uid), profile);
    await SecureStorageService.saveUserProfile(profile);
    return profile;
  },

  /**
   * Send password reset email to user
   */
  async sendPasswordReset(email: string): Promise<void> {
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address first.');
    }
    await sendPasswordResetEmail(auth, email.trim());
  },

  /**
   * Log out current user and clear encrypted auth tokens & profile
   */
  async signOut(): Promise<void> {
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      // Ignore Google sign out error if not signed in via Google
    }
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn('AuthService: Firebase sign out error:', e);
    } finally {
      await SecureStorageService.clearAuthData();
    }
  },

  /**
   * Update user profile in Firestore and update secure local cache
   */
  async updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, updates, { merge: true });
    const updatedSnap = await getDoc(userRef);
    const updatedProfile = updatedSnap.data() as UserProfile;
    await SecureStorageService.saveUserProfile(updatedProfile);
    return updatedProfile;
  },

  /**
   * Get user profile from Firestore and update secure local cache
   */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const profile = docSnap.data() as UserProfile;
        await SecureStorageService.saveUserProfile(profile);
        return profile;
      }
    } catch (e) {
      console.warn('AuthService: Error fetching user profile from Firestore:', e);
    }
    return await SecureStorageService.getUserProfile();
  },
};

export default AuthService;
