const kinds={marketplace:['marketplaceConversations','buyerUserId','sellerUserId'],property:['propertyConversations','interestedUserId','ownerUserId']};
const listings = {
  marketplace: ['marketplaceListings', 'sellerUserId', ['AVAILABLE', 'RESERVED']],
  property: ['propertyListings', 'ownerUserId', ['AVAILABLE', 'UNDER_OFFER']]
};

export function conversationListing(state, kind, listingId, userId) {
  const [collection, ownerField, statuses] = listings[kind];
  const listing = (state[collection] || []).find(row => row.id === listingId);
  const active = id => state.users.some(user => String(user.id) === String(id) && user.status === 'active');
  if (!listing || !statuses.includes(listing.status) || !active(userId) || !active(listing[ownerField])) {
    throw Object.assign(Error('This listing is not available for new enquiries.'), { status: 404 });
  }
  if (String(listing[ownerField]) === String(userId)) {
    throw Object.assign(Error('You cannot start an enquiry on your own listing.'), { status: 400 });
  }
  return listing;
}

export function writableConversation(state,kind,id,userId){
  const [collection,...fields]=kinds[kind];
  const conversation=(state[collection]||[]).find(c=>c.id===id);
  const participants=conversation&&fields.map(key=>String(conversation[key]));
  if(!conversation||conversation.status!=='ACTIVE'||!participants.includes(String(userId))||participants.some(id=>!state.users.some(u=>String(u.id)===id&&u.status==='active'))){
    throw Object.assign(Error('This conversation is not available for new messages.'),{status:404});
  }
  return conversation;
}
