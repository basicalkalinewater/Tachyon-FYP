import { createSlice } from "@reduxjs/toolkit";

const getPersistedUser = () => {
  try {
    const raw = localStorage.getItem("tachyon:user");
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Failed to parse stored user", err);
    return null;
  }
};

const persistUser = (user) => {
  try {
    if (user) {
      localStorage.setItem("tachyon:user", JSON.stringify(user));
    } else {
      localStorage.removeItem("tachyon:user");
    }
  } catch (err) {
    console.warn("Failed to persist user", err);
  }
};

const initialState = {
  user: typeof window !== "undefined" ? getPersistedUser() : null,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    loginStart(state) {
      state.loading = true;
      state.error = null;
    },
    loginSuccess(state, action) {
      state.loading = false;
      state.user = action.payload;
      persistUser(state.user);
    },
    loginFailure(state, action) {
      state.loading = false;
      state.error = action.payload || "Login failed";
    },
    logout(state) {
      state.user = null;
      persistUser(null);
    },
    setUserDetails(state, action) {
      if (!state.user) return;
      state.user = { ...state.user, ...action.payload };
      persistUser(state.user);
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout, setUserDetails } = authSlice.actions;

export const selectCurrentUser = (state) => state.auth.user;
export const selectAuthLoading = (state) => state.auth.loading;
export const selectAuthError = (state) => state.auth.error;

export default authSlice.reducer;
