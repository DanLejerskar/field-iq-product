// React 19 testing-library hint: tell React the act() environment is wired.
// Without this, calls to act() in our tests log a noisy stderr warning, even
// though they still work correctly.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
