import { endpointRequiresUserKey } from 'librechat-data-provider';
import { useChatContext } from '~/Providers/ChatContext';
import { useGetEndpointsQuery } from '~/data-provider';
import useUserKey from './useUserKey';

export default function useRequiresKey() {
  const { conversation } = useChatContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { endpoint } = conversation || {};
  const { getExpiry } = useUserKey(endpoint ?? '');
  const expiryTime = getExpiry();
  const requiresKey = endpointRequiresUserKey(endpointsConfig, endpoint, expiryTime ?? '');
  return { requiresKey };
}
