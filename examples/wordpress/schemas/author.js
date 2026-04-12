/** @type {import('../../dist/types.js').ContentTypeDefinition} */
export default {
  id: 'author',
  name: 'Author',
  fields: [
    { id: 'displayName', name: 'Display Name', type: 'Symbol', required: true, localized: false },
    { id: 'login', name: 'Login', type: 'Symbol', required: true, localized: false },
    { id: 'email', name: 'Email', type: 'Symbol', required: false, localized: false },
    { id: 'firstName', name: 'First Name', type: 'Symbol', required: false, localized: false },
    { id: 'lastName', name: 'Last Name', type: 'Symbol', required: false, localized: false },
  ],
};
